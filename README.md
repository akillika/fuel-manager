# Fuel

A private fuel log — mileage, spend, distance — computed for you.

Same stack as `drink-manager`: React + Vite + TypeScript + Tailwind + Firebase (Auth / Firestore), Recharts for charts. Different design language — Linear/Vercel dashboard aesthetic, no colored icon tiles, no activity rings.

## Run locally

```bash
npm install
npm run dev
```

Opens on http://localhost:5175.

Demo mode is on by default (`VITE_DEV_DEMO=true` in `.env.local`) — the app boots signed-in as "Akil" with seven months of realistic fill-up history, so you can browse every screen without touching Firebase.

## Wire up Firebase

1. Firebase Console → create a project → add a Web app → copy the config.
2. Enable Google sign-in in Authentication → Sign-in method.
3. Firestore → create database in production mode, add the rules below.
4. Paste the config values into `.env.local` and set `VITE_DEV_DEMO=false`.

### Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /fillups/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /vehicles/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /fuelGoals/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## Deploy

Vercel: import the repo, set the `VITE_FIREBASE_*` env vars and `VITE_DEV_DEMO=false`, deploy.

## Design language

- **Neutral canvas + one accent** (ink itself). No colored icon tiles, no activity rings, no gradient buttons.
- **Big display numbers** with tight negative tracking and tabular figures.
- **Hairline separators** for structure. Sharp radii (6-8px), no soft pillows.
- **Real data tables** for fill-ups with sortable columns and hover-only actions.
- **Thin single-line charts** — no filled areas, no legend clutter.
- **Green up / red down** as the only semantic colors, reserved for real deltas.
