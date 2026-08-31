/**
 * Petrol receipt + pump-display OCR via ocr.space (Engine 2).
 *
 * The API key is read from `VITE_OCR_SPACE_KEY` at build time — if it isn't
 * set, we fall back to the compiled-in default. The value is shipped inside
 * the client bundle, so it is discoverable to anyone who opens DevTools.
 * That is acceptable for a private personal deployment but worth noting
 * before making the site public.
 *
 * The parser still targets Indian pump displays and printed receipts where
 * `rate × volume ≈ amount`, and uses that physical relation as the primary
 * signal — labels alone are unreliable across formats.
 */

export interface ReceiptExtract {
  volume?: number;         // litres
  pricePerLitre?: number;  // ₹/L
  total?: number;          // ₹
  station?: string;
  fuelGrade?: string;
  rawText: string;
  confidence: number;      // 0-100 (ocr.space does not report this, so we synthesise from parse quality)
}

const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const OCR_SPACE_KEY = ((import.meta.env.VITE_OCR_SPACE_KEY as string | undefined) || '').trim();
const MAX_UPLOAD_BYTES = 1_000_000; // ocr.space free tier ~1 MB

/**
 * Cap the long edge at MAX px and re-encode as JPEG until the result is
 * under the byte budget. Works around ocr.space's 1 MB free-tier limit.
 */
async function shrinkForUpload(file: Blob): Promise<Blob> {
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error('Could not decode the image.'));
      el.src = url;
    });
    let maxEdge = 2000;
    let quality = 0.9;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>(res =>
        canvas.toBlob(b => res(b), 'image/jpeg', quality),
      );
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
      // Overshot — shrink further next round.
      if (attempt % 2 === 0) quality = Math.max(0.55, quality - 0.1);
      else maxEdge = Math.max(1000, Math.round(maxEdge * 0.85));
    }
    // Last resort: return whatever the smallest attempt produced.
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Send the image to ocr.space, return the parsed text.
 */
async function ocrViaOcrSpace(
  file: Blob,
  onProgress?: (pct: number, stage: string) => void,
): Promise<{ text: string; ok: boolean; error?: string }> {
  onProgress?.(15, 'uploading');
  const form = new FormData();
  form.append('apikey', OCR_SPACE_KEY);
  form.append('language', 'eng');
  form.append('OCREngine', '2');       // Engine 2 handles LCD-ish text much better than 1.
  form.append('scale', 'true');        // upscales small text
  form.append('isTable', 'false');
  form.append('detectOrientation', 'true');
  form.append('file', file, 'receipt.jpg');

  onProgress?.(35, 'recognising');
  let response: Response;
  try {
    response = await fetch(OCR_SPACE_ENDPOINT, { method: 'POST', body: form });
  } catch (e: any) {
    return { text: '', ok: false, error: `Network error while contacting OCR service: ${e?.message || e}` };
  }
  if (!response.ok) {
    return { text: '', ok: false, error: `OCR service returned ${response.status}.` };
  }
  const body = await response.json().catch(() => null) as any;
  if (!body) return { text: '', ok: false, error: 'OCR service returned an unreadable response.' };
  if (body.IsErroredOnProcessing) {
    const msg = Array.isArray(body.ErrorMessage) ? body.ErrorMessage.join(' ') : String(body.ErrorMessage || 'Unknown OCR error.');
    return { text: '', ok: false, error: msg };
  }
  const first = Array.isArray(body.ParsedResults) ? body.ParsedResults[0] : null;
  const text = (first?.ParsedText || '').trim();
  onProgress?.(90, 'parsing');
  return { text, ok: true };
}

/**
 * Run OCR on an image blob/file.
 */
export async function ocrImage(
  file: Blob,
  onProgress?: (pct: number, stage: string) => void,
): Promise<ReceiptExtract> {
  onProgress?.(0, 'preparing');
  const shrunk = await shrinkForUpload(file);
  const result = await ocrViaOcrSpace(shrunk, onProgress);
  const text = result.text;
  const parsed = parseReceipt(text);
  // Synthesise a confidence: 3/3 fields extracted = 100, 2/3 = 66, 1/3 = 33, 0/3 = 0.
  const found = [parsed.volume, parsed.pricePerLitre, parsed.total].filter(v => v != null).length;
  const confidence = result.ok ? Math.round((found / 3) * 100) : 0;
  onProgress?.(100, 'done');
  return {
    ...parsed,
    rawText: result.ok ? text : (result.error || 'OCR failed.'),
    confidence,
  };
}

interface Cand {
  n: number;
  raw: string;
  line: number;
  index: number;
}

/**
 * Parse OCR text into a structured Fillup draft.
 *
 * Strategy:
 *  1. Extract every number from every line, tag each with its line index.
 *  2. First pass: label→number association (label same line, next 2 lines,
 *     or previous 2 lines). Handles both printed receipts and pump LCDs.
 *  3. Second pass: physics — pick the (a, b, c) triple where a×b≈c, a is a
 *     plausible ₹/L (60-200), b is a plausible volume (0.1-100), c ≥ 20,
 *     and none of them sit in the petrol-density band (680-830 kg/m³) that
 *     pump displays love to show.
 *  4. Backfill anything the physics pass didn't cover.
 */
export function parseReceipt(text: string): Omit<ReceiptExtract, 'rawText' | 'confidence'> {
  // For each whitespace-separated token, try converting letter/digit
  // lookalikes (O→0, I/l→1, B→8, S→5). If the result parses as a plain
  // number, keep it; otherwise leave the original token alone.
  const digitize = (line: string) => line.replace(/\S+/g, tok => {
    if (tok.length < 2) return tok;
    const cand = tok
      .replace(/[Oo]/g, '0')
      .replace(/[Il]/g, '1')
      .replace(/B/g, '8')
      .replace(/S/g, '5');
    if (/^\d{1,6}(?:[.,]\d{1,3})?$/.test(cand)) return cand;
    return tok;
  });

  const clean = text
    .replace(/\r/g, '')
    .replace(/\|/g, 'I')
    .replace(/[·•]/g, ' ');
  const rawLines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const lines = rawLines.map(digitize);
  const joined = rawLines.join(' ').replace(/\s+/g, ' ');

  // Pool of numeric candidates with line index.
  const cands: Cand[] = [];
  lines.forEach((line, li) => {
    for (const m of line.matchAll(/(\d{1,5}(?:[.,]\d{1,3})?)/g)) {
      const raw = m[1];
      const n = Number(raw.replace(/,/g, ''));
      if (isFinite(n) && n > 0) cands.push({ n, raw, line: li, index: m.index || 0 });
    }
  });

  const numberNear = (labelPatt: RegExp, min: number, max: number): number | undefined => {
    const pickFromLine = (line: string): number | undefined => {
      for (const m of line.matchAll(/(\d{1,5}(?:[.,]\d{1,3})?)/g)) {
        const n = Number(m[1].replace(/,/g, ''));
        if (isFinite(n) && n >= min && n <= max) return n;
      }
      return undefined;
    };
    for (let i = 0; i < lines.length; i++) {
      if (!labelPatt.test(lines[i])) continue;
      let hit = pickFromLine(lines[i]);
      if (hit != null) return hit;
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        hit = pickFromLine(lines[j]);
        if (hit != null) return hit;
      }
      for (let j = i - 1; j >= Math.max(i - 2, 0); j--) {
        hit = pickFromLine(lines[j]);
        if (hit != null) return hit;
      }
    }
    return undefined;
  };

  let volume =
    numberNear(/\b(?:QUANTITY|QTY|VOLUME|VOL|LTR|LITRES?)\b/i, 0.1, 100);
  let pricePerLitre =
    numberNear(/\b(?:RATE|PRICE|UNIT\s*PRICE|RATE\s*\/?\s*L|RS\s*\/?\s*L|₹\s*\/?\s*L)\b/i, 60, 200);
  let total =
    numberNear(/\b(?:TOTAL\s*AMOUNT|AMOUNT|TOTAL|AMT|RUPEES|GRAND\s*TOTAL|AMT\s*\(?\s*₹\s*\)?)\b/i, 20, 100000);

  const isDensity = (x: number) => x >= 680 && x <= 830;
  const ns = cands.map(c => c.n);
  if (!volume || !pricePerLitre || !total) {
    let best: { a: number; b: number; c: number; err: number } | null = null;
    for (const a of ns) {
      if (a < 60 || a > 200 || isDensity(a)) continue;
      for (const b of ns) {
        if (b < 0.1 || b > 100 || isDensity(b) || Math.abs(a - b) < 0.001) continue;
        const c = a * b;
        for (const cand of ns) {
          if (cand < 20 || isDensity(cand)) continue;
          const err = Math.abs(cand - c) / cand;
          if (err < 0.015 && (!best || err < best.err)) {
            best = { a, b, c: cand, err };
          }
        }
      }
    }
    if (best) {
      if (!pricePerLitre) pricePerLitre = best.a;
      if (!volume)        volume        = best.b;
      if (!total)         total         = best.c;
    }
  }

  if (!total) {
    const remaining = ns
      .filter(n => n >= 20)
      .filter(n => !isDensity(n))
      .filter(n => n !== volume && n !== pricePerLitre)
      .sort((a, b) => b - a);
    if (remaining[0] != null) total = remaining[0];
  }

  const brands: [string, RegExp][] = [
    ['Indian Oil',           /\bINDIAN\s*OIL\b/i],
    ['IOCL',                 /\bIOCL\b/i],
    ['HP',                   /\bHP(?:CL)?\b/i],
    ['Hindustan Petroleum',  /\bHINDUSTAN\s*PETROLEUM\b/i],
    ['BPCL',                 /\bBPCL\b/i],
    ['Bharat Petroleum',     /\bBHARAT\s*PETROLEUM\b/i],
    ['Shell',                /\bSHELL\b/i],
    ['Essar',                /\bESSAR\b/i],
    ['Nayara',               /\bNAYARA\b/i],
    ['Reliance',             /\bRELIANCE\b/i],
  ];
  let station: string | undefined;
  for (const [name, re] of brands) {
    if (re.test(joined)) { station = name; break; }
  }

  const gradeMatch = joined.match(/\b(XTRA\s*PREMIUM|XTRA\s*MILE|SPEED\s*97|POWER\s*99|XP\s*95|PREMIUM|REGULAR|PETROL|DIESEL|CNG)\b/i);
  const fuelGrade = gradeMatch?.[1];

  return { volume, pricePerLitre, total, station, fuelGrade };
}
