/**
 * Petrol receipt OCR + parser.
 *
 * Uses Tesseract.js (lazy-loaded) so the base bundle stays small. Only
 * downloads the language data when the user actually taps "Scan receipt".
 *
 * The parser is tuned for Indian pump receipts (IOCL / HP / BPCL / Shell)
 * where the printout typically shows:
 *   RATE / PRICE  95.30 / L
 *   QUANTITY / VOL 32.10 L
 *   AMOUNT / TOTAL 3061.10
 */

export interface ReceiptExtract {
  volume?: number;         // litres
  pricePerLitre?: number;  // ₹/L
  total?: number;          // ₹
  station?: string;
  fuelGrade?: string;
  rawText: string;
  confidence: number;      // 0-100 from Tesseract
}

type TesseractLib = typeof import('tesseract.js');

let cachedLib: TesseractLib | null = null;
async function getTesseract(): Promise<TesseractLib> {
  if (cachedLib) return cachedLib;
  cachedLib = await import('tesseract.js');
  return cachedLib;
}

/**
 * Run OCR on an image blob/file. Reports progress percentage 0-100 through
 * the optional callback (loading + recognizing).
 */
export async function ocrImage(
  file: Blob,
  onProgress?: (pct: number, stage: string) => void,
): Promise<ReceiptExtract> {
  const Tesseract = await getTesseract();
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m: any) => {
      if (onProgress && typeof m.progress === 'number') {
        onProgress(Math.round(m.progress * 100), m.status || '');
      }
    },
  });
  const text = (data.text || '').trim();
  const parsed = parseReceipt(text);
  return { ...parsed, rawText: text, confidence: data.confidence || 0 };
}

/**
 * Parse extracted OCR text into a structured Fillup draft. Uses several
 * regex passes and picks the best-fit candidates.
 */
export function parseReceipt(text: string): Omit<ReceiptExtract, 'rawText' | 'confidence'> {
  const clean = text.replace(/\r/g, '').replace(/\|/g, 'I');
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const joined = clean.replace(/\s+/g, ' ');

  const numericOnAnyLine = (label: RegExp): number | undefined => {
    for (const line of lines) {
      const m = line.match(label);
      if (m && m[1]) {
        const n = Number(m[1].replace(/,/g, ''));
        if (isFinite(n)) return n;
      }
    }
    return undefined;
  };

  // Volume - often 'QUANTITY', 'VOLUME', 'VOL', 'LITRES', or a number followed by "L" / "LTR"
  let volume =
    numericOnAnyLine(/(?:QUANTITY|QTY|VOLUME|VOL|LTR|LITRES?)\s*[:\-]?\s*(\d{1,3}(?:[.,]\d{1,3})?)/i) ??
    numericOnAnyLine(/^\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:L|LTR|LITRES?)\b/i);

  // Price per litre - often 'RATE', 'PRICE', 'UNIT PRICE', 'RATE/L'
  let pricePerLitre =
    numericOnAnyLine(/(?:RATE|PRICE|UNIT\s*PRICE|RATE\s*\/\s*L|RS\s*\/\s*L)\s*[:\-]?\s*(\d{2,3}(?:[.,]\d{1,3})?)/i);

  // Total - AMOUNT, TOTAL, TOTAL AMOUNT, AMT, or the largest ₹ amount on the receipt
  let total =
    numericOnAnyLine(/(?:TOTAL\s*AMOUNT|AMOUNT|TOTAL|AMT|RUPEES|GRAND\s*TOTAL)\s*[:\-]?\s*(?:RS\.?|INR|₹)?\s*(\d{1,6}(?:[.,]\d{1,2})?)/i) ??
    numericOnAnyLine(/(?:₹|RS\.?|INR)\s*(\d{1,6}(?:[.,]\d{1,2})?)/i);

  // Fallback - try to find three numbers that multiply out
  // (a * b ≈ c within 1% tolerance)
  if (!volume || !pricePerLitre || !total) {
    const nums = Array.from(joined.matchAll(/(\d{1,5}(?:[.,]\d{1,3})?)/g))
      .map(m => Number(m[1].replace(/,/g, '')))
      .filter(n => isFinite(n) && n > 0);
    for (let i = 0; i < nums.length; i++) {
      for (let j = 0; j < nums.length; j++) {
        if (i === j) continue;
        const a = nums[i]; // candidate price/L (60-200)
        const b = nums[j]; // candidate volume (0.5-100)
        if (a < 60 || a > 200) continue;
        if (b < 0.5 || b > 100) continue;
        const c = a * b;
        // Find a matching total in the numbers list
        const match = nums.find(n => n > 50 && Math.abs(n - c) / c < 0.01);
        if (match) {
          if (!pricePerLitre) pricePerLitre = a;
          if (!volume) volume = b;
          if (!total) total = match;
          break;
        }
      }
      if (volume && pricePerLitre && total) break;
    }
  }

  // Station name - looks for common Indian brands anywhere in the text
  const brands = ['INDIAN OIL', 'IOCL', 'HP', 'HINDUSTAN PETROLEUM', 'BPCL', 'BHARAT PETROLEUM', 'SHELL', 'ESSAR', 'NAYARA', 'RELIANCE'];
  let station: string | undefined;
  for (const b of brands) {
    const re = new RegExp(b + '.*', 'i');
    const m = joined.match(re);
    if (m) { station = m[0].slice(0, 40).trim(); break; }
  }

  // Fuel grade - common labels
  const gradeMatch = joined.match(/\b(XTRA\s*PREMIUM|XTRA\s*MILE|SPEED\s*97|POWER\s*99|XP\s*95|PREMIUM|REGULAR|PETROL|DIESEL|CNG)\b/i);
  const fuelGrade = gradeMatch?.[1];

  return { volume, pricePerLitre, total, station, fuelGrade };
}
