# Solar Plant Manager

A free, smartphone-first management app for solar plants, built on **Google Sheets + Google Drive** (via Google Apps Script) — no per-user Google logins, no hosting cost.

## Features
- **Attendance** for site engineers and labour, with optional geotagged check-in/out photos.
- **Periodic location check-ins** at a configurable interval to verify site presence.
- **Live engineer location** shown on the site map while the app is open.
- **Labour task management** with before / during / after progress photos (counts configurable). Each task has a **work type** (Panel Cleaning / Deweeding / Other + specify), **multiple assigned labours**, **shift** (auto Morning for deweeding, Evening for cleaning) and **duration** (default 3 h).
- **Draw blocks/zones on the real map**: admins draw irregular block and panel-zone polygons **directly on the satellite view** (free-hand, any shape — not a symmetrical grid). Blocks are freely created, renamed, reshaped, dragged, and deleted. Custom zones can be added for deweeding tracking.
- **Task ↔ block linking + history**: when an engineer logs Panel Cleaning / Deweeding they select the exact block(s)/zone(s) covered. Each block shows its **last-cleaned / last-deweeded date and "days since"**, colour-coded (green <7d, amber <14d, red >14d) so you can see what's overdue at a glance.
- **Daily import/export meter readings** and **inverter generation readings**, with verification photos.
- **Site map**: block/panel layout overlay + free **satellite view** (Leaflet + Esri imagery), no Google Maps billing.
- **Tamper-resistant photos**: coordinates + timestamp burned into the image and a SHA-256 hash stored in the Sheet.
- **Full customisation**: app name, logo, check-in interval, required photo counts, drive folder — all editable in-app (Management Settings).
- **No lost progress**: every photo is written to the device the instant it's captured and uploaded to Drive immediately; if the browser is refreshed or the phone clears RAM, pending photos auto-sync on next open/online. Task before/during/after photos persist on the server as they're taken.
- **Multi-plant ready**: plants are a column in the data; start with one, add more later.
- **Manager view**: both the Sheets (raw data) and an in-app dashboard (maps, photos, live locations, approvals).

## Architecture
- **Backend:** `backend/` — Google Apps Script Web App (`Code.gs`, `DB.gs`, `Storage.gs`, `appsscript.json`). Talks to Sheets + Drive under the deployer's account.
- **Frontend:** `frontend/` — installable PWA (vanilla JS, Leaflet maps), hosted free on GitHub Pages / Netlify.

## Get started
See **[SETUP.md](SETUP.md)** for the step-by-step deploy guide (create Sheet → paste backend → deploy web app → host frontend → configure).
