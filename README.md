# Codenames · two-screen online game

Thai Codenames pass-and-play on the shared player board, with a separate Spymaster screen. Firebase keeps public game state in sync; the answer key stays server-side.

## Run locally

1. Create a Firebase project and register a Web app.
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Create a **Cloud Firestore Standard** database. Pick a nearby region; the database region cannot be changed later.
4. Copy `.env.example` to `.env.local` and fill in the Firebase Web app values.
5. Create a Firebase service account. For local development set `GOOGLE_APPLICATION_CREDENTIALS` to the downloaded JSON file path (keep the file outside this repository). For Vercel, put the compact, one-line JSON in the server-only `FIREBASE_SERVICE_ACCOUNT_JSON` secret.
6. Paste `firestore.rules` into **Firestore → Rules** and publish them.
7. Start Next.js:

   ```bash
   npm run dev
   ```

## Firebase values

The four `NEXT_PUBLIC_FIREBASE_*` values (`apiKey`, `authDomain`, `projectId`, `appId`) are in **Firebase Console → Project settings → General → Your apps → SDK setup and configuration**. They identify the browser app and are expected to be public.

The Admin SDK service account has `project_id`, `client_email`, and `private_key`. The email address alone is not sufficient. The private key is used only by Next.js Route Handlers: never prefix it with `NEXT_PUBLIC_`, add it to browser code, send it in chat, or commit it. Configure it in Vercel Project Settings → Environment Variables.

## Play on two screens

1. Open the deployed app on the Spymaster screen and choose **สร้างห้อง Spymaster**. This creates the fixed room `ROOM` and resets it for a new round.
2. Confirm **แสดง Key Card** on that screen, then use **คัดลอกลิงก์จอกระดาน**.
3. Open that link on the shared player-board screen, or choose **เปิดจอกระดานผู้เล่น** there. Both screens join `ROOM` without entering a code.
4. Spymaster starts the round and gives clues aloud. Players discuss and tap cards on the shared board; a correct team card leaves the turn open, while a neutral or opposing card passes the turn automatically. Either screen can end the turn manually.

Spymaster and players can share each screen with as many people as needed. Only the two screens need to connect to the room. A refreshed screen can resume its saved room in the same browser.

## Data and access model

- `rooms/ROOM` contains the public board, current turn, revealed card colors, and authenticated member IDs.
- `rooms/ROOM/secret/key` contains the unrevealed key card and is never readable through the browser Firestore SDK.
- Browser writes are denied by `firestore.rules`. Route Handlers verify Firebase anonymous-auth tokens and enforce room membership, Spymaster actions, turn rules, and reveal outcomes using the Firebase Admin SDK.
- `ROOM` is a fixed join name for this private friend group, not an account credential. The app is not intended as an anti-cheat competitive service.

## Deploy

Deploy this Next.js project to Vercel, set the four public Firebase Web app values and the server-only service account JSON for the target environments, and add the Vercel domain to Firebase Authentication's authorized domains. The Firestore rules must be published in the Firebase Console before play.
