/* Durable photo outbox.
   A captured photo is written to IndexedDB BEFORE we attempt the upload, so even
   if the browser is refreshed, the phone clears RAM, or the upload is interrupted,
   the photo is never lost — it re-syncs the next time the app is open and online.
   Each photo is uploaded to Drive immediately (not held in memory as a draft). */

const PhotoOutbox = {
  _db: null,
  _open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('spm_photos', 1);
      req.onupgradeneeded = (e) => { e.target.result.createObjectStore('pending', { keyPath: '_id' }); };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = (e) => reject(e.target.error);
    });
  },
  async add(rec) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('pending', 'readwrite');
      t.objectStore('pending').put(rec);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async all() {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const out = [];
      const t = db.transaction('pending', 'readonly');
      const cur = t.objectStore('pending').openCursor();
      cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
      cur.onerror = () => reject(cur.error);
    });
  },
  async remove(id) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('pending', 'readwrite');
      t.objectStore('pending').delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
};

// Capture a photo, durably store it, then upload to Drive immediately.
async function queuePhoto(rec) {
  rec._id = 'P' + Date.now() + '_' + Math.random().toString(36).slice(2);
  rec.time = rec.time || new Date().toISOString();
  rec.plantId = rec.plantId || currentPlantId();
  await PhotoOutbox.add(rec);
  await flushPendingPhotos();
}

// Upload every pending photo to Drive and record it. Safe to call repeatedly.
async function flushPendingPhotos() {
  if (!State.token) return;
  if (!navigator.onLine) return; // keep until back online
  let items = [];
  try { items = await PhotoOutbox.all(); } catch (e) { return; }
  if (!items.length) return;
  let touchedTask = false;
  for (const it of items) {
    try {
      const up = await API.call('photo.upload', {
        base64: it.base64, lat: it.lat, lng: it.lng, time: it.time,
        plantId: it.plantId, filename: it.filename || ('photo_' + Date.now() + '.jpg')
      });
      if (up.queued) continue; // offline guard
      if (it.kind === 'task') {
        await API.call('task.photo.add', {
          taskId: it.taskId, phase: it.phase, fileId: up.fileId, url: up.url,
          lat: it.lat, lng: it.lng, time: it.time, hash: up.hash
        });
        touchedTask = true;
      }
      await PhotoOutbox.remove(it._id);
    } catch (e) {
      // keep in outbox for the next attempt
    }
  }
  if (touchedTask && location.hash.indexOf('#/task/') === 0) Views.taskDetail.mount();
}
