# Telegram bot setup

One-time setup, ~10 minutes.

## 1. Create the bot

1. Open Telegram, DM **@BotFather**.
2. Send `/newbot`, pick a display name (e.g. `Fuel by Akil`), pick a handle ending in `bot` (e.g. `fuel_akil_bot`).
3. BotFather replies with an HTTP API **token** — copy it.
4. (Optional) Send `/setdescription`, `/setcommands` with:
   ```
   fill - Log a fill-up: VOL PRICE [STATION] ODO
   last - Show your last fill-up
   undo - Delete the fill-up you just logged
   vehicles - List vehicles
   switch - Change the default vehicle: /switch NAME
   link - Link this Telegram account to Fuel: /link CODE
   help - Show all commands
   ```

## 2. Firebase service account

1. Firebase Console → Project Settings → **Service accounts** → **Generate new private key**.
2. Downloads a JSON file. Open it, copy the entire contents.

## 3. Vercel env vars

Project → Settings → Environment Variables. Add these three, scope to **Production + Preview + Development**:

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | The token from step 1.3 |
| `TELEGRAM_WEBHOOK_SECRET` | A random string you make up (e.g. run `openssl rand -hex 24`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Paste the entire JSON blob from step 2 on one line |

Also update the client-visible var so the Settings page links to your bot:

| Name | Value |
| --- | --- |
| `VITE_TELEGRAM_BOT_HANDLE` | The handle without `@`, e.g. `fuel_akil_bot` |

Redeploy (Vercel does this automatically on env-var change if you tick "Redeploy").

## 4. Register the webhook with Telegram

Once Vercel has deployed, tell Telegram where to send updates. Replace `TOKEN`, `SECRET`, and the URL:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://fuel.akil.codes/api/telegram-webhook",
    "secret_token": "<SECRET>",
    "allowed_updates": ["message"]
  }'
```

Should reply `{"ok":true,"result":true,"description":"Webhook was set"}`.

To confirm at any time:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## 5. Firestore rules + indexes

Deploy the updated rules (they now cover `telegramLinks` and `telegramUsers`):

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 6. Link your Telegram account

1. Open your Fuel web app → **Settings** → **Telegram bot** → **Generate link code**.
2. DM the bot: `/link CODE`.
3. Bot replies `✅ Linked`. Test it: `/fill 8.5 102.50 HP Adyar 26550`.

## Commands cheat sheet

- `/fill 8.5 102.50 HP Adyar 26550` — 8.5 L at ₹102.50/L at HP Adyar, odometer 26550
- `/fill 10 96 26550` — no station name (skipped when only 3 tokens)
- `/last` — most recent fill-up on your default vehicle
- `/undo` — delete the fill-up you just posted (only the last one)
- `/vehicles` — list all vehicles; the default is starred
- `/switch Baleno` — change the default vehicle
- `/help` — full list

## Troubleshooting

- **Bot doesn't reply**: `getWebhookInfo` shows the last error. Common causes are wrong `secret_token` or the Vercel deploy still building.
- **`/link` says "not found"**: code expired (5-min window). Generate a fresh one.
- **`/fill` says "no default vehicle"**: your linked user has no vehicle set. Use `/vehicles` then `/switch NAME`.
- **Bot leaks the key**: keys live in Vercel env vars only. The client bundle does not include `TELEGRAM_BOT_TOKEN` or the service-account JSON.
