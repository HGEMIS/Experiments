# Solar Plant Manager — Setup Guide

This app is **100% free to run**:
- **Backend:** Google Apps Script (a Web App) bound to a Google Sheet. It writes data to that Sheet and uploads photos to your Google Drive / company Shared Drive using *your* account — so field workers never see a Google login popup.
- **Frontend:** A mobile web app (PWA) you host for free on GitHub Pages (or Netlify). Workers open it in their phone browser and "Add to Home Screen".

## 1. Create the database spreadsheet
1. Go to [sheets.new](https://sheets.new) and create a new Google Sheet.
2. Name it e.g. **SolarPlantDB**. (The script creates all the tabs automatically on first run.)
3. Optional: share it with the managers who should be able to view the raw data.

## 2. Create the Apps Script backend
1. In that Sheet: **Extensions → Apps Script**.
2. Delete the placeholder `Code.gs` content.
3. Copy these files from the `backend/` folder of this repo into the script project (create each file with the same name):
   - `appsscript.json`  (create it via the **⚙️ Project Settings → Manifest** or add a new file named `appsscript.json`)
   - `Code.gs`
   - `DB.gs`
   - `Storage.gs`
4. **Enable the Drive API (advanced service):**
   - In the Apps Script editor, **+ → Services → Drive API → v2 → Add**.
   - This is required so photos can be written into a **company Shared Drive** (Team Drive). For a normal "My Drive" folder it is harmless to leave enabled.
5. **Save** the project.

## 3. Deploy the Web App
1. **Deploy → New deployment → Select type: Web app**.
2. Description: `SolarPlantAPI`.
3. **Execute as:** *Me*  (this is what makes writes happen under your account — no user popups).
4. **Who has access:** *Anyone* (the app's own email/password login protects it; the URL is effectively a secret).
5. Click **Deploy**. Authorize the scopes when prompted (Sheets, Drive, Apps Script).
6. Copy the **Web app URL** — it looks like `https://script.google.com/macros/s/AKfyc.../exec`.

> Tip: after making code changes, click **Deploy → Manage deployments → edit → New version** and redeploy so the URL keeps serving the latest code.

## 4. Open the app and create the first admin
1. Host the `frontend/` folder (see section 7) and open it on your phone/computer.
2. On first load you'll see **Setup**. Paste the Web app URL and tap *Save & Continue*.
3. Because no users exist yet, you'll be sent to **Create first admin** — enter your name/email/password.
4. You're now signed in as admin.

## 5. Configure (Management settings)
Open **Settings** (⚙️) as admin:
- **App name / logo** — shown in the header; change anytime.
- **Check-in interval (minutes)** — how often engineers are pinged for a periodic location check-in.
- **Required BEFORE / DURING / AFTER photos** — per labour task phase.
- **Attendance photo** — require a geotagged photo on check-in/out.
- **Photo storage → Drive type + Folder ID**:
  - *My Drive folder*: open any Drive folder, copy the ID from its URL (`.../folders/<FOLDER_ID>`).
  - *Company Shared Drive*: open the Shared Drive folder, copy its ID; the deploying account must be an **Editor** on that Shared Drive.
- Tap **Save settings**.

## 6. Add plant(s) and layout
In **Settings → Plants**, add each solar plant with its centre lat/lng.
For the block/panel overlay, **Import a .geojson file** (or paste GeoJSON) describing the blocks/panels as polygons/points. The site map draws this on top of the satellite view.
You said you already have layout coordinates — export them from your CAD/GIS tool as GeoJSON and import here.

## 7. Add users
In **Settings → Users**, add engineers, labour, managers, and admins with email + password and assign them to a plant. They sign in with those credentials on their phones.

## 8. Host the frontend (free)
**GitHub Pages (this repo):**
1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `arena/01a02319-experiments`, folder `/frontend`.
3. Your app is live at `https://<user>.github.io/Experiments/frontend/`.

**Or Netlify:** drag-drop the `frontend/` folder at [app.netlify.com/drop](https://app.netlify.com/drop).

Workers: open the URL in the phone browser → menu → **Add to Home Screen**.

## 9. How the anti-tamper photos work
- At capture time the app reads a **fresh GPS fix** and the **device time**, then burns `Lat / Lng / timestamp` text directly into the image pixels (a watermark) and downscales it.
- The bytes are uploaded to Drive; the server stores a **SHA-256 hash** of the file plus the lat/lng/time in the Sheet.
- Because the coordinates/time are part of the pixels and a hash is recorded, editing the photo later breaks the hash and is visible to reviewers. (For highest assurance, also keep "Require geotag" on.)

## 10. Location tracking
- While the app is open, the engineer's position is sent live and shown as a dot on the **Map**.
- In the background the app relies on the configurable **periodic check-in** (default every 15 min) — true always-on background GPS is restricted by phone OSes and drains battery, so we use "live when open + periodic checks" (your chosen option).

## 11. Offline use
- The app shell is cached by a service worker, so it **opens offline**.
- Form submissions and photo uploads made while offline are **queued on the device** and auto-sync the moment the phone reconnects (a toast confirms).

## 12. Limits & scaling
- Apps Script is free but has daily quotas; plenty for one plant, comfortable for several. For many plants, consider Google Cloud Functions + a database later (the frontend already calls a plain JSON API, so swapping the backend is straightforward).
- Photos live in your Drive, so storage there is the only real cost driver.

## Files in this repo
```
backend/   Apps Script backend (paste into the script project)
frontend/  PWA (host on GitHub Pages / Netlify)
SETUP.md   this guide
```

## Drawing blocks / zones on the map (recommended)
The plant layout is **not** a fixed grid — blocks are irregular. So instead of importing a GeoJSON, an admin/manager can **draw the blocks straight onto the satellite map**:
1. Open the **Map** and tap **✏️ Edit blocks** (admins/managers only).
2. Use the Geoman toolbar (top-left): draw a **Polygon** or **Rectangle** for each block/zone. You'll be asked to name it (e.g. `A1`, `A7`, `Zone-North`).
3. After drawing, you can **drag** blocks to reposition, **edit vertices** to reshape, or use the **Blocks / zones** list to **Rename** / **Delete** any block.
4. Tap **Done editing** — the layout auto-saves to the plant.

Blocks are saved as GeoJSON in the plant record, so they persist and line up on the satellite imagery.

**Linking tasks to blocks:** when creating a task (Panel Cleaning, Deweeding, Other), pick the **Blocks / zones** the work covers. Completed tasks feed the per-block history shown when you tap a block on the map: **last cleaned**, **last deweeded**, and **days since** each (colour-coded: green <7d, amber <14d, red >14d). This is how you track *when which panels were cleaned / what area was deweeded*.

(You can still import a coordinate-accurate GeoJSON via Settings → Plants if your CAD/survey export has real lat/lng; the rename tool there also lets you fix a mislabeled block such as A8 → A7.)

## Photos never get lost (durable upload)
Each photo is written to the device (IndexedDB) **the moment it's captured**, then uploaded to Drive immediately. If the engineer refreshes the browser, the phone clears RAM, or the upload is interrupted / offline, the photo stays queued and **auto-syncs the next time the app is open and online** — progress on a task (before → during → after) is never lost. Already-uploaded photos are also recorded in the Sheet, so reopening a task shows everything captured so far. The readings form (meter/inverter) is likewise auto-saved locally, so typed values survive a refresh.

Tip: for longest uptime on a phone, **Add the app to the Home Screen** (browser menu → "Add to Home Screen") and keep the tab open between captures. Captures happen while the app is foreground; uploads are immediate, and anything pending recovers automatically.
- **Task work types.** When creating/editing a labour task you pick the work: **Panel Cleaning**, **Deweeding**, or **Other** (with a free-text "specify" field). You also choose **who is doing it** (multiple labours can be assigned), the **shift** (Morning/Evening) and **duration in hours**. The shift auto-defaults to **Evening for Panel Cleaning** and **Morning for Deweeding**, and duration defaults to **3 hours** — matching your typical operation (deweed in the morning, clean panels in the evening, ~3 h shifts). Change any of these per task.
- **Fixing block names (e.g. A7 shown as A8).** After importing the plant layout GeoJSON (Settings → Plants → import), open **Settings → Plants → "Rename blocks"** for that plant. It lists every block from the layout with an editable name field — rename the mislabeled block (A8 → A7), Save, and the corrected names are used on the map and in task/block references. You can also re-import an updated GeoJSON anytime.

