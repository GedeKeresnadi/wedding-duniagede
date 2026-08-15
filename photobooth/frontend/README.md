# #duNiaGede Photobooth

A mobile-first wedding photobooth web app for Gede & Nia's reception. Guests scan a QR code, enter their name, take two photos, and get a beautiful branded photo strip they can download or share — with an automatic backup copy saved to the wedding owner's Google Drive.

```
QR → Name → Camera → Photo 1 → Photo 2 → Photo strip → Retake / Download / Share → Drive backup
```

## What's in this folder

```
duniagede-photobooth/
├── frontend/
│   ├── index.html      the whole app (one page, several screens)
│   ├── style.css        design system + layout
│   ├── config.js         ← edit branding, backend URL, photo-strip layout here
│   └── app.js            camera, canvas compositing, upload logic
├── backend/
│   ├── Code.gs            Apps Script web app (Drive uploads + session log)
│   └── Config.gs          ← edit your Drive folder ID here
└── README.md              this file
```

No build step, no npm install. It's plain HTML/CSS/JS, so you can host `frontend/` anywhere that serves static files (GitHub Pages works well, and keeps it next to your existing invitation site).

---

## 1. Set up the Google Drive folder

1. In Google Drive, create a folder called **`DU-NIA-GEDE PHOTOBOOTH`**.
2. Open the folder and copy the ID from the URL:
   `https://drive.google.com/drive/folders/`**`1AbCdEfGhIjKlmNoPQRstuVWxyz`**
3. You'll paste that ID into `backend/Config.gs` in the next step.

The app will automatically create, inside that folder, a dated subfolder (e.g. `2026-08-19/`) with `RAW/` and `FINAL/` subfolders the first time a guest uses the booth. It will also create a **`Photobooth Sessions`** Google Sheet in the same folder to log every session.

## 2. Configure and deploy the Apps Script backend

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Delete the default `Code.gs` content and paste in this project's `backend/Code.gs`.
3. Add a second file (**+ → Script**) named `Config.gs` and paste in `backend/Config.gs`.
4. In `Config.gs`, set:
   ```js
   driveFolderId: "PASTE_YOUR_DRIVE_FOLDER_ID_HERE",
   eventDateFolder: "2026-08-19",
   ```
5. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me** (this authorizes the script to write to *your* Drive, so guests never need to log in)
   - Who has access: **Anyone**
6. Click **Deploy**, authorize the requested permissions, and copy the **Web app URL** it gives you (ends in `/exec`).

That URL is your backend endpoint — you'll need it in the next step.

## 3. Connect the frontend to the backend

Open `frontend/config.js` and paste your Web app URL:

```js
backendUrl: "https://script.google.com/macros/s/AKfycb.../exec",
```

If you leave this as the placeholder, the app still works end-to-end for guests (camera, photo strip, download, share) — it just silently skips the Drive backup, which is handy while testing locally.

## 4. Host the frontend

Any static host works. The simplest option, since it lives next to the existing invitation:

1. Copy the `frontend/` folder's contents into a `photobooth/` folder in the `wedding-duniagede` GitHub repo.
2. Push to GitHub — GitHub Pages will serve it at
   `https://gedekeresnadi.github.io/wedding-duniagede/photobooth/`
3. **Camera access requires HTTPS** (GitHub Pages already serves HTTPS, so you're covered). If you test locally, use `https://localhost` or a tool like `npx serve`, not `file://`.

## 5. Generate the QR code

Use any free QR generator (e.g. [qr-code-generator.com](https://www.qr-code-generator.com)) pointed at your hosted URL from step 4. Print it as a table card or add it to a sign near the reception area.

---

## Customizing

Everything you're likely to want to change lives in **`frontend/config.js`**:

| What | Where |
|---|---|
| Couple names, hashtag, date, location | `CONFIG` object |
| Backend URL | `CONFIG.backendUrl` |
| Photo strip colors, fonts, photo positions, canvas size | `PHOTO_STRIP` object |
| Number of photos, countdown length | `CONFIG.photoCount`, `CONFIG.countdownSeconds` |

The Drive folder and file-naming prefix live in **`backend/Config.gs`**.

To restyle the app shell (buttons, screens, the ornament frame), edit `frontend/style.css` — the color tokens are declared once at the top under `:root`.

---

## Testing checklist

**Camera**
- Open the hosted URL on a phone, tap **Start Photobooth**, enter a name, and continue.
- The browser should prompt for camera permission. Allow it — you should see your live front camera feed.
- Deny it once (or block it in browser settings) to confirm the friendly "We need access to your camera" screen and **Try Again** button work.

**Photo strip**
- Take both photos. Confirm the countdown, shutter flash, and photo-preview screens each look right, and that **Retake** returns you to the camera for that shot only.
- On the final screen, confirm the composed strip shows both photos correctly cropped (no stretching), the couple's names, date, and location.

**Download & share**
- Tap **Download** — a PNG should save to the device with a filename like `DU-NIA-GEDE_001_YourName_184532.png`.
- On a phone that supports the Web Share API (most modern iOS/Android browsers), a **Share** button should also appear and open the native share sheet with the image attached.

**Google Drive**
- After a completed session, check the `DU-NIA-GEDE PHOTOBOOTH/2026-08-19/RAW/` and `.../FINAL/` folders in Drive — you should see the two raw photos and the final strip.
- Open the `Photobooth Sessions` sheet and confirm a row was added with the guest's name, timestamp, links to all three files, and status `completed`.
- To test failure handling, temporarily set an invalid `backendUrl` in `config.js`, run through a session, and confirm you see "Your photo is ready, but we couldn't save a copy..." with working **Download Photo** and **Try Saving Again** buttons — and that the download still works.

---

## Troubleshooting

**Camera permission issues**
- Camera access only works over HTTPS (or `localhost`). Check the address bar shows a padlock.
- On iPhone: Settings → Safari → Camera → Allow (or per-site permission if using Chrome/Firefox on iOS, which use the WebKit engine and follow Safari's setting).
- On Android Chrome: tap the lock/info icon left of the address bar → Permissions → Camera → Allow, then reload.
- If a guest previously denied permission, the browser won't ask again automatically — they need to change it in settings before tapping **Try Again**.

**Drive upload failures**
- Confirm `backendUrl` in `config.js` exactly matches the deployed Web app URL (ends in `/exec`, not `/dev`).
- In Apps Script, check **Executions** (left sidebar) for error details on failed runs.
- Make sure the deployment is set to **Execute as: Me** and **Who has access: Anyone** — if access is restricted, guest requests will be rejected before your code even runs.
- If you've edited `Code.gs` or `Config.gs` after the first deployment, you need to create a **new deployment** (or a new version of the existing one) for changes to take effect — saving the script alone doesn't update a live `/exec` URL.
- `driveFolderId` must be the folder ID (the string after `/folders/` in the URL), not the full URL.

**Nothing happens when I tap Start on desktop**
- The app works on desktop with a webcam, but shows a small "works best on your phone" banner by design — this is expected, not a bug.
