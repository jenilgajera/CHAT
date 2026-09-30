# Friends Chat

Private WhatsApp-style messenger for a small friends group. The **Ionic + Angular** app talks to a **Node.js + Express** API with **MongoDB**. Realtime updates use **Socket.IO**. Host the API on **Render**.

## Layout

- `app/` — Ionic Angular client (Android via Capacitor, iPhone via PWA)
- `server/` — Express API + Socket.IO + Mongoose

## What I chose

- Username + password (JWT, 30 days). No fake emails.
- First registered account becomes **admin** and **active**. Later signups are **pending** until an admin approves them.
- Default invite code: `FRIENDS` (change in Admin → More, or `INVITE_CODE` env).
- Photos stay as compressed base64 on message documents (max ~150 KB). No object storage.
- `enablePush` defaults to **false**. Token save endpoints exist; sending FCM is not wired.

## Local run

### 1. MongoDB

Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas). Allow your IP (or `0.0.0.0/0` for a first test). Copy the connection string.

### 2. API

```bash
cd server
copy .env.example .env
```

Edit `.env`:

```
PORT=3000
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/friendschat
JWT_SECRET=a-long-random-string
CLIENT_ORIGIN=http://localhost:4200,http://localhost:8100
ENABLE_PUSH=false
INVITE_CODE=FRIENDS
```

```bash
npm install
npm start
```

Health check: `http://localhost:3000/api/health`

### 3. App

```bash
cd app
npm install
npm start
```

Open `http://localhost:4200`. Register the first user (that person is admin). Approve later friends in the **Admin** tab.

Change `app/src/environments/environment.ts` if the API is not on port 3000.

## Deploy API on Render

1. Push this repo to GitHub.
2. On Render: **New → Blueprint** using `render.yaml`, or **New Web Service** with:
   - Root directory: `server`
   - Build: `npm install`
   - Start: `npm start`
   - Instance: free
3. Environment:
   - `MONGO_URI` — Atlas URI (also allow Render in Atlas Network Access)
   - `JWT_SECRET` — long random string
   - `CLIENT_ORIGIN` — your PWA origin(s), comma-separated
   - `ENABLE_PUSH=false`
4. After the first deploy, set `app/src/environments/environment.prod.ts`:

```ts
apiUrl: 'https://YOUR_SERVICE.onrender.com/api',
socketUrl: 'https://YOUR_SERVICE.onrender.com',
```

Rebuild the app. Optional: copy `app/www` onto the API so one Render service also hosts the PWA (`server` already serves `app/www` if that folder exists on the machine). For a split setup, add a **Static Site** with publish directory `app/www` after `cd app && npm run build`.

Free Render web services **sleep**. The first request after idle can take ~30s.

## PWA (iPhone)

1. Build: `cd app && npm run build`
2. Host `www/` (Render static or the Express static folder).
3. Safari → Share → **Add to Home Screen**.

## Android APK

```bash
cd app
npm run build
npx cap add android
npx cap sync
```

Open Android Studio → Build APK. Create and store a release keystore yourself; do not commit it.

## Roles

| Status | What they see |
| --- | --- |
| pending | Waiting for approval + logout |
| disabled | Account disabled + logout |
| active | Chats |
| admin + active | Extra Admin tab |

The API rejects inactive users on chat routes and requires admin for `/api/admin/*`. Admins cannot read another chat’s **messages** unless they are a member.

## Features

- Private chats (id = sorted user ids) and groups
- Ticks (sent / delivered / read), unread counts, typing, last seen
- Photos, reply, copy, delete for me / everyone, in-chat search, mute
- Announcements broadcast, audit log, stats, invite code, registration lock
- “Delete user” = disable + pull from chats. The login row stays.

## Manual tests (two browsers)

1. Register user A (becomes admin). Register user B with invite `FRIENDS` → pending screen.
2. A approves B. B reloads into chats.
3. A starts a private chat, send text (optimistic clock → tick). B sees it live, unread badge, then ticks go double/blue after open.
4. Typing + last seen. Scroll up for older messages after 30+.
5. Group: create, rename, add/remove, leave. Colored sender names.
6. Photo from gallery; oversized photos rejected after compress.
7. Disable B: B sees disabled screen. Last admin cannot be demoted.
8. Broadcast appears at top of chat list. Pending/disabled cannot open `/tabs/chats`.

## Known limitations

- No Firestore-style offline cache. Failed HTTP sends need a retry.
- Render free tier sleeps; Atlas free has storage/connection limits.
- Admin group list can see last-message previews on groups (not full history unless a member).
- Push when the app is closed needs extra FCM/APNs setup and `enablePush=true`.
- Login accounts are not hard-deleted; disable + remove from chats only.
