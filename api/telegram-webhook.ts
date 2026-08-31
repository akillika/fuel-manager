/**
 * Telegram bot webhook.
 *
 * Deployed as a Vercel serverless function. Receives updates from Telegram,
 * authenticates the message's Telegram user against Firestore's
 * telegramUsers collection, and either:
 *   - links a new Telegram account to a Fuel user (via /link CODE)
 *   - logs a fill-up (via /fill), lists info, or undoes the last fill.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN           - from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET      - random string; matched against Telegram's
 *                                  X-Telegram-Bot-Api-Secret-Token header
 *   FIREBASE_SERVICE_ACCOUNT_JSON - service account JSON (single line)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

let app: App | undefined;
function getApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) { app = existing; return app; }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  app = initializeApp({ credential: cert(JSON.parse(raw)) });
  return app;
}

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

interface LinkedUser {
  telegramId: number;
  userId: string;
  defaultVehicleId?: string | null;
  username?: string | null;
  lastFillId?: string;
}

async function sendMessage(chatId: number, text: string, extra?: Record<string, unknown>) {
  if (!TG_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }),
  });
}

async function getLinked(db: FirebaseFirestore.Firestore, telegramId: number): Promise<LinkedUser | null> {
  const snap = await db.collection('telegramUsers').doc(String(telegramId)).get();
  return snap.exists ? (snap.data() as LinkedUser) : null;
}

const HELP = `<b>Commands</b>
<code>/fill VOL PRICE [STATION] ODO</code>
  e.g. <code>/fill 8.5 102.50 HP Adyar 26550</code>
<code>/last</code> - show your last fill-up
<code>/undo</code> - delete the fill-up you just logged
<code>/vehicles</code> - list vehicles
<code>/switch NAME</code> - change the default vehicle
<code>/help</code> - this message`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, note: 'This endpoint expects Telegram POST webhooks.' });
  }
  if (WEBHOOK_SECRET) {
    const supplied = req.headers['x-telegram-bot-api-secret-token'];
    if (supplied !== WEBHOOK_SECRET) return res.status(401).json({ error: 'bad secret' });
  }

  try { getApp(); } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
  const db = getFirestore();

  const update = req.body as any;
  const msg = update?.message;
  if (!msg?.from || !msg.chat) return res.status(200).end();
  const chatId: number = msg.chat.id;
  const telegramId: number = msg.from.id;
  const text: string = (msg.text || '').trim();

  const reply = (t: string) => sendMessage(chatId, t);

  try {
    // /start
    if (/^\/start\b/.test(text)) {
      await reply(`<b>FuelManager</b>\n\nLog fill-ups from Telegram.\n\nTo link, generate a code in the web app's <b>Settings</b>, then send:\n<code>/link YOUR-CODE</code>`);
      return res.status(200).end();
    }

    // /link CODE
    const linkMatch = text.match(/^\/link\s+([A-Z0-9\-]{4,32})/i);
    if (linkMatch) {
      const code = linkMatch[1].toUpperCase();
      const linkRef = db.collection('telegramLinks').doc(code);
      const linkSnap = await linkRef.get();
      if (!linkSnap.exists) {
        await reply('❌ Code not found. Generate a new one from the web app.');
        return res.status(200).end();
      }
      const link = linkSnap.data() as any;
      const expiresAt: Timestamp | null = link.expiresAt || null;
      if (expiresAt && expiresAt.toMillis() < Date.now()) {
        await linkRef.delete();
        await reply('❌ Code expired. Generate a new one.');
        return res.status(200).end();
      }
      await db.collection('telegramUsers').doc(String(telegramId)).set({
        telegramId,
        userId: link.userId,
        defaultVehicleId: link.defaultVehicleId || null,
        username: msg.from.username || null,
        firstName: msg.from.first_name || null,
        linkedAt: FieldValue.serverTimestamp(),
      });
      await linkRef.delete();
      await reply(`✅ Linked. You can now log fill-ups.\n\nExample:\n<code>/fill 8.5 102.50 HP Adyar 26550</code>\n\n<code>/help</code> for more.`);
      return res.status(200).end();
    }

    // Everything below requires a link.
    const linked = await getLinked(db, telegramId);
    if (!linked) {
      await reply(`Not linked yet.\n\nGo to the web app <b>Settings</b>, tap <i>Generate link code</i>, then send:\n<code>/link YOUR-CODE</code>`);
      return res.status(200).end();
    }

    if (/^\/help\b/.test(text) || text === '?') {
      await reply(HELP);
      return res.status(200).end();
    }

    // /vehicles
    if (/^\/vehicles?\b/.test(text) && !/^\/switch/.test(text)) {
      const snap = await db.collection('vehicles').where('userId', '==', linked.userId).get();
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      if (list.length === 0) { await reply('No vehicles. Add one in the web app first.'); return res.status(200).end(); }
      const lines = list.map((v: any, i: number) =>
        `${i + 1}. ${v.id === linked.defaultVehicleId ? '⭐ ' : ''}<b>${v.name}</b>${v.plate ? ` <code>${v.plate}</code>` : ''}`
      ).join('\n');
      await reply(`<b>Your vehicles</b>\n${lines}\n\nSwitch with: <code>/switch NAME</code>`);
      return res.status(200).end();
    }

    // /switch NAME
    const switchMatch = text.match(/^\/switch\s+(.+)/i);
    if (switchMatch) {
      const query = switchMatch[1].trim().toLowerCase();
      const snap = await db.collection('vehicles').where('userId', '==', linked.userId).get();
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const match = list.find((v: any) => v.name.toLowerCase().includes(query));
      if (!match) { await reply(`❌ No vehicle matches "${query}". Try <code>/vehicles</code>.`); return res.status(200).end(); }
      await db.collection('telegramUsers').doc(String(telegramId)).update({ defaultVehicleId: match.id });
      await reply(`✅ Active vehicle is now <b>${(match as any).name}</b>.`);
      return res.status(200).end();
    }

    // /last
    if (/^\/last\b/.test(text)) {
      if (!linked.defaultVehicleId) { await reply('No default vehicle. Use <code>/vehicles</code>.'); return res.status(200).end(); }
      const snap = await db.collection('fillups')
        .where('userId', '==', linked.userId)
        .where('vehicleId', '==', linked.defaultVehicleId)
        .get();
      const fills = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      fills.sort((a, b) => b.date.toMillis() - a.date.toMillis());
      const f: any = fills[0];
      if (!f) { await reply('No fill-ups yet.'); return res.status(200).end(); }
      const d: Date = f.date.toDate();
      await reply(`<b>Last fill-up</b>\n${d.toDateString()}\n<b>₹${f.totalCost.toFixed(2)}</b> · ${f.volume}L @ ₹${f.pricePerLitre.toFixed(2)}\nOdo <code>${f.odometer}</code>${f.station ? ` · ${f.station}` : ''}`);
      return res.status(200).end();
    }

    // /undo
    if (/^\/undo\b/.test(text)) {
      if (!linked.lastFillId) { await reply('Nothing recent to undo.'); return res.status(200).end(); }
      await db.collection('fillups').doc(linked.lastFillId).delete();
      await db.collection('telegramUsers').doc(String(telegramId)).update({ lastFillId: FieldValue.delete() });
      await reply('✅ Removed.');
      return res.status(200).end();
    }

    // /fill VOL PRICE [STATION...] ODO
    if (/^\/fill\b/.test(text)) {
      const rest = text.replace(/^\/fill\s*/, '').trim();
      if (!rest) {
        await reply('Usage: <code>/fill VOL PRICE [STATION] ODO</code>\ne.g. <code>/fill 8.5 102.50 HP Adyar 26550</code>');
        return res.status(200).end();
      }
      if (!linked.defaultVehicleId) { await reply('❌ No default vehicle. Use <code>/vehicles</code> to pick one.'); return res.status(200).end(); }
      const parts = rest.split(/\s+/);
      if (parts.length < 2) { await reply('❌ Need at least volume and price.'); return res.status(200).end(); }
      const volume = Number(parts[0]);
      const price = Number(parts[1]);
      if (!isFinite(volume) || volume <= 0) { await reply('❌ Volume must be a positive number.'); return res.status(200).end(); }
      if (!isFinite(price) || price < 10) { await reply('❌ Price must be a positive number (₹/L).'); return res.status(200).end(); }
      // Odo is the last purely-numeric token if it's plausible (>100).
      let odo: number | undefined;
      const lastTok = parts[parts.length - 1];
      const lastNum = Number(lastTok);
      if (parts.length > 2 && isFinite(lastNum) && lastNum > 100) {
        odo = Math.round(lastNum);
      }
      const stationTokens = parts.slice(2, odo != null ? parts.length - 1 : parts.length);
      const station = stationTokens.join(' ').trim();
      if (!odo) {
        await reply('❌ Odometer required (as the last number).\nUsage: <code>/fill VOL PRICE [STATION] ODO</code>');
        return res.status(200).end();
      }
      const total = Math.round(volume * price * 100) / 100;
      const fillRef = await db.collection('fillups').add({
        userId: linked.userId,
        vehicleId: linked.defaultVehicleId,
        date: Timestamp.now(),
        odometer: odo,
        volume,
        pricePerLitre: price,
        totalCost: total,
        isFull: true,
        station: station || null,
        fuelGrade: 'Petrol',
        tag: 'personal',
        source: 'telegram',
      });
      await db.collection('telegramUsers').doc(String(telegramId)).update({
        lastFillId: fillRef.id,
        lastFillAt: FieldValue.serverTimestamp(),
      });
      await reply(`✅ Logged\n<b>₹${total.toFixed(2)}</b> · ${volume}L @ ₹${price.toFixed(2)}/L\nOdo <code>${odo}</code>${station ? ` · ${station}` : ''}\n\nReply <code>/undo</code> to remove.`);
      return res.status(200).end();
    }

    await reply(`Unknown command. Try <code>/help</code>.`);
    return res.status(200).end();
  } catch (e: any) {
    console.error('webhook error', e);
    try { await reply(`❌ Server error: ${e?.message || e}`); } catch { /* swallow */ }
    return res.status(200).end();
  }
}
