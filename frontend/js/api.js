/* API layer: talks to the Apps Script Web App.
   Uses text/plain POST (a "simple" request) to avoid CORS preflight.
   Network failures on queued writes are stored in an outbox and replayed
   automatically when the device comes back online. */

const API = {
  get base() { return (window.State && State.apiBase) || window.AppConfig.apiBase || ''; },

  async call(action, payload, opts) {
    opts = opts || {};
    if (!this.base) throw new Error('API not configured. Open the Setup screen.');
    const body = Object.assign({}, payload || {}, { action });
    if (opts.auth !== false && window.State && State.token) body.token = State.token;
    try {
      const res = await fetch(this.base, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        mode: 'cors'
      });
      const data = await res.json();
      if (data && data.ok === false) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      // TypeError from fetch === network/offline error.
      if (opts.queue && err && err.name === 'TypeError') {
        Outbox.add({ action, payload: body, auth: opts.auth !== false });
        return { ok: true, queued: true };
      }
      throw err;
    }
  }
};

const Outbox = {
  key: 'spa_outbox',
  list() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch (e) { return []; } },
  add(item) {
    const l = this.list();
    item._id = Date.now() + '_' + Math.random().toString(36).slice(2);
    l.push(item);
    localStorage.setItem(this.key, JSON.stringify(l));
    UI.toast('Saved — will sync when online');
  },
  remove(id) {
    const l = this.list().filter((x) => x._id !== id);
    localStorage.setItem(this.key, JSON.stringify(l));
  },
  async flush() {
    const l = this.list();
    if (!l.length) return;
    for (const item of l.slice()) {
      try {
        await API.call(item.action, item.payload, { auth: item.auth, queue: false });
        this.remove(item._id);
        UI.toast('Synced queued item');
      } catch (e) { /* keep for next time */ }
    }
  }
};

window.addEventListener('online', () => Outbox.flush());
