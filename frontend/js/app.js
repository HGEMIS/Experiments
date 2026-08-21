/* ============================================================
   Solar Plant Manager - PWA front-end (router + views)
   ============================================================ */

window.State = {
  apiBase: localStorage.getItem('spa_api') || window.AppConfig.apiBase || '',
  token: localStorage.getItem('spa_token') || '',
  user: JSON.parse(localStorage.getItem('spa_user') || 'null'),
  settings: {},
  plants: [],
  needsInit: false
};

const Live = { watchId: null, pos: null, map: null, markers: {}, mapInterval: null, checkinInterval: null };

/* ---------- persistence ---------- */
function saveApi(v) { State.apiBase = v; localStorage.setItem('spa_api', v); }
function saveSession(token, user) { State.token = token; State.user = user; localStorage.setItem('spa_token', token); localStorage.setItem('spa_user', JSON.stringify(user)); }
function clearSession() { State.token = ''; State.user = null; localStorage.removeItem('spa_token'); localStorage.removeItem('spa_user'); }
function currentPlantId() { return (State.user && State.user.plantId) || (State.plants[0] && State.plants[0].PlantID) || ''; }
function currentPlant() { return State.plants.find((p) => p.PlantID === currentPlantId()) || State.plants[0] || null; }
function hasRole(roles) { return State.user && roles.indexOf(State.user.role) >= 0; }
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

/* ---------- branding ---------- */
function applyBranding() {
  const s = State.settings || {};
  document.getElementById('appname').textContent = s.AppName || 'Solar Plant Manager';
  document.title = s.AppName || 'Solar Plant Manager';
  const logo = document.getElementById('logo');
  if (s.LogoURL) { logo.src = s.LogoURL; logo.style.display = 'block'; }
  else logo.style.display = 'none';
  const meta = document.querySelector('meta[name="theme-color"]');
}

function updateNet() {
  const f = document.getElementById('netflag');
  if (navigator.onLine) { f.textContent = '●'; f.className = 'netflag'; f.title = 'Online'; }
  else { f.textContent = '●'; f.className = 'netflag off'; f.title = 'Offline (queued)'; }
}
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);

/* ---------- navigation / router ---------- */
function navigate(path) { location.hash = '#/' + path; }
const PUBLIC = ['login', 'setup', 'createAdmin'];

function route() {
  cleanupLive();
  const raw = (location.hash || '').replace(/^#\/?/, '') || (State.token ? 'dashboard' : 'login');
  const hash = raw.split('/')[0]; // base segment (e.g. 'task' for 'task/ID')
  if (!State.apiBase && !PUBLIC.includes(hash)) { location.hash = '#/setup'; return; }
  if (!State.token && !PUBLIC.includes(hash)) { location.hash = '#/login'; return; }
  if (State.token && PUBLIC.includes(hash)) { location.hash = '#/dashboard'; return; }
  const view = Views[hash] || Views.dashboard;
  renderView(view, hash);
}

function renderView(view, key) {
  const main = document.getElementById('view');
  main.innerHTML = view.html ? view.html() : UI.spinner();
  renderNav(key);
  document.getElementById('topbar').style.display = PUBLIC.includes(key) ? 'none' : 'flex';
  if (view.mount) { try { view.mount(); } catch (e) { UI.toast(e.message, 'err'); } }
  window.scrollTo(0, 0);
}

const NAV = [
  { key: 'dashboard', label: 'Home', ic: '🏠', roles: ['engineer', 'labour', 'manager', 'admin'] },
  { key: 'attendance', label: 'Attend', ic: '🕒', roles: ['engineer', 'labour'] },
  { key: 'tasks', label: 'Tasks', ic: '🧰', roles: ['engineer', 'labour', 'manager', 'admin'] },
  { key: 'readings', label: 'Meters', ic: '🔌', roles: ['engineer', 'manager', 'admin'] },
  { key: 'map', label: 'Map', ic: '🛰️', roles: ['engineer', 'labour', 'manager', 'admin'] },
  { key: 'manager', label: 'Manage', ic: '📊', roles: ['manager', 'admin'] },
  { key: 'settings', label: 'Settings', ic: '⚙️', roles: ['manager', 'admin'] }
];

function renderNav(active) {
  const nav = document.getElementById('bottomnav');
  if (!State.token) { nav.innerHTML = ''; return; }
  nav.innerHTML = NAV.filter((n) => n.roles.indexOf(State.user.role) >= 0).map((n) =>
    `<a href="#/${n.key}" class="${n.key === active ? 'active' : ''}"><span class="ic">${n.ic}</span>${n.label}</a>`
  ).join('');
}

/* ---------- live tracking ---------- */
function startLive() {
  if (!State.token) return;
  if (hasRole(['engineer'])) {
    if (navigator.geolocation && Live.watchId == null) {
      Live.watchId = navigator.geolocation.watchPosition(
        (p) => { Live.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; pushLocation(); },
        () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      );
    }
    const mins = parseInt((State.settings.CheckinIntervalMin || '15'), 10) || 15;
    if (Live.checkinInterval == null) {
      Live.checkinInterval = setInterval(() => {
        if (Live.pos) API.call('checkin', { lat: Live.pos.lat, lng: Live.pos.lng, accuracy: Live.pos.acc, plantId: currentPlantId() }, { queue: true });
      }, Math.max(1, mins) * 60 * 1000);
    }
  }
}
function pushLocation() {
  if (Live.pos) API.call('location.update', { lat: Live.pos.lat, lng: Live.pos.lng, accuracy: Live.pos.acc, plantId: currentPlantId() }, { queue: true });
}
function cleanupLive() {
  if (Live.watchId != null) { navigator.geolocation.clearWatch(Live.watchId); Live.watchId = null; }
  if (Live.checkinInterval != null) { clearInterval(Live.checkinInterval); Live.checkinInterval = null; }
  if (Live.mapInterval != null) { clearInterval(Live.mapInterval); Live.mapInterval = null; }
  if (Live.map) { try { Live.map.remove(); } catch (e) {} Live.map = null; }
  Live.markers = {};
}

/* ---------- bootstrap ---------- */
async function bootstrap() {
  const data = await API.call('bootstrap', {}, { auth: !!State.token });
  State.settings = data.settings || {};
  State.plants = data.plants || [];
  State.needsInit = !!data.needsInit;
  if (data.user) State.user = data.user;
  applyBranding();
  return data;
}

async function init() {
  // register service worker (needs https)
  if ('serviceWorker' in navigator && location.protocol.startsWith('https')) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) {}
  }
  updateNet();
  document.getElementById('logoutBtn').onclick = () => { clearSession(); cleanupLive(); navigate('login'); };

  if (!State.apiBase) { location.hash = '#/setup'; route(); return; }
  try {
    await bootstrap();
  } catch (e) {
    if (!State.token) { location.hash = '#/login'; route(); return; }
    UI.toast(e.message, 'err');
  }
  if (State.needsInit && !State.token) { location.hash = '#/createAdmin'; }
  if (State.token && !State.user) { clearSession(); location.hash = '#/login'; }
  route();
  if (State.token) { startLive(); flushPendingPhotos(); }
  window.addEventListener('online', () => flushPendingPhotos());
}

/* ============================================================
   Shared helpers (work types, task editor, block rename)
   ============================================================ */
function workLabel(w) {
  return ({ panel_cleaning: 'Panel Cleaning', deweeding: 'Deweeding', other: 'Other' }[w]) || (w || '—');
}

function blockStr(t) {
  const b = (t.Blocks || t.BlockID || '').split(',').filter(Boolean);
  return b.length ? (' · ' + b.map(UI.esc).join(', ')) : '';
}

function parseLayout(plant) {
  try {
    const gj = JSON.parse((plant && plant.LayoutGeoJSON) || '{}');
    if (gj.type === 'FeatureCollection') return gj;
    if (gj.type) return { type: 'FeatureCollection', features: [gj] };
  } catch (e) {}
  return { type: 'FeatureCollection', features: [] };
}

function layoutBlockNames(plant) {
  const fc = parseLayout(plant);
  return (fc.features || []).map((f) => (f.properties && (f.properties.name || f.properties.Name)) || '').filter(Boolean);
}

// Build per-block last-cleaned / last-deweeded dates from completed tasks.
function computeBlockStats(tasks) {
  const map = {};
  (tasks || []).forEach((t) => {
    const blocks = (t.Blocks || t.BlockID || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!blocks.length) return;
    const date = t.CreatedAt || t.DueDate || '';
    if (!date) return;
    const key = (t.WorkType === 'deweeding') ? 'deweeded' : 'cleaned';
    blocks.forEach((b) => {
      map[b] = map[b] || { cleaned: null, deweeded: null };
      if (!map[b][key] || new Date(date) > new Date(map[b][key])) map[b][key] = date;
    });
  });
  return map;
}

function daysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d < 0 ? 0 : d;
}

function blockPopup(name, st) {
  st = st || {};
  const c = st.cleaned ? (new Date(st.cleaned).toLocaleDateString() + ' · ' + daysSince(st.cleaned) + 'd ago') : 'never';
  const w = st.deweeded ? (new Date(st.deweeded).toLocaleDateString() + ' · ' + daysSince(st.deweeded) + 'd ago') : 'never';
  return '<b>' + UI.esc(name) + '</b><br>Last cleaned: ' + UI.esc(c) + '<br>Last deweeded: ' + UI.esc(w);
}

function loadReadingsDraft() {
  try { return JSON.parse(localStorage.getItem('spm_readings_draft') || 'null'); } catch (e) { return null; }
}
function saveReadingsDraft(d) {
  try { localStorage.setItem('spm_readings_draft', JSON.stringify(d)); }
  catch (e) {
    // quota exceeded (e.g. many photos) — keep fields, drop photos
    try { localStorage.setItem('spm_readings_draft', JSON.stringify({ meter: d.meter, inverter: d.inverter })); } catch (e2) {}
  }
}

function openTaskModal(labour, existing) {
  const t = existing || {};
  const blockNames = layoutBlockNames(currentPlant());
  const blockChecks = blockNames.length
    ? blockNames.map((b) => `<label class="row" style="gap:8px;margin:4px 0"><input type="checkbox" value="${UI.esc(b)}" ${(t.Blocks && t.Blocks.split(',').indexOf(b) >= 0) ? 'checked' : ''} style="width:auto"> ${UI.esc(b)}</label>`).join('')
    : '<span class="muted small">No blocks drawn yet — an admin can draw them on the Map.</span>';
  const html = `
    <label>Work type</label>
    <select id="t_work">
      <option value="panel_cleaning" ${t.WorkType === 'panel_cleaning' ? 'selected' : ''}>Panel Cleaning</option>
      <option value="deweeding" ${t.WorkType === 'deweeding' ? 'selected' : ''}>Deweeding</option>
      <option value="other" ${t.WorkType === 'other' ? 'selected' : ''}>Other</option>
    </select>
    <div id="t_other_wrap" style="${t.WorkType === 'other' ? '' : 'display:none'}">
      <label>Specify work</label><input id="t_other" value="${UI.esc(t.OtherDetail || '')}" placeholder="e.g. Vegetation clearing"></div>
    <label>Title</label><input id="t_title" value="${UI.esc(t.Title || '')}" placeholder="e.g. Clean Block A">
    <label>Description</label><textarea id="t_desc" placeholder="Details">${UI.esc(t.Description || '')}</textarea>
    <label>Assign labours (who is doing it)</label>
    <div id="t_assign">${labour.length ? labour.map((u) => `<label class="row" style="gap:8px;margin:4px 0"><input type="checkbox" value="${UI.esc(u.UserID)}" data-name="${UI.esc(u.Name)}" style="width:auto"> ${UI.esc(u.Name)}</label>`).join('') : '<span class="muted small">No labour users yet</span>'}</div>
    <label>Shift</label>
    <select id="t_shift"><option value="Morning" ${t.Shift === 'Morning' ? 'selected' : ''}>Morning</option><option value="Evening" ${t.Shift === 'Evening' ? 'selected' : ''}>Evening</option></select>
    <label>Duration (hours)</label><input id="t_dur" type="number" step="0.5" min="0.5" value="${t.DurationHrs || '3'}">
    <label>Blocks / zones (which areas are covered)</label>
    <div id="t_blocks">${blockChecks}</div>`;
  UI.modal({
    title: existing ? 'Edit task' : 'New labour task',
    html,
    onOpen: (box) => {
      const work = box.querySelector('#t_work');
      const otherWrap = box.querySelector('#t_other_wrap');
      const sync = () => {
        otherWrap.style.display = work.value === 'other' ? 'block' : 'none';
        if (!existing) box.querySelector('#t_shift').value = (work.value === 'panel_cleaning') ? 'Evening' : 'Morning';
      };
      work.onchange = sync; sync();
      if (existing && t.AssignedTo) t.AssignedTo.split(',').forEach((id) => { const c = box.querySelector('#t_assign input[value="' + id + '"]'); if (c) c.checked = true; });
    },
    actions: [
      { label: 'Cancel', cls: 'sec', onClick: (c) => c() },
      { label: existing ? 'Save' : 'Create', cls: '', onClick: async (c) => {
        const work = document.getElementById('t_work').value;
        const other = work === 'other' ? document.getElementById('t_other').value : '';
        const checks = Array.from(document.querySelectorAll('#t_assign input:checked'));
        const title = document.getElementById('t_title').value.trim();
        if (!title) return UI.toast('Title required', 'err');
        const payload = {
          workType: work, otherDetail: other, title,
          description: document.getElementById('t_desc').value,
          assignedTo: checks.map((x) => x.value),
          assignedName: checks.map((x) => x.dataset.name),
          shift: document.getElementById('t_shift').value,
          durationHrs: document.getElementById('t_dur').value || 3,
          blocks: Array.from(document.querySelectorAll('#t_blocks input:checked')).map((x) => x.value),
          blockId: Array.from(document.querySelectorAll('#t_blocks input:checked')).map((x) => x.value)[0] || '',
          plantId: currentPlantId()
        };
        if (existing) { payload.taskId = t.TaskID; await API.call('tasks.update', payload, { queue: true }); }
        else { await API.call('tasks.add', payload, { queue: true }); }
        c(); UI.toast(existing ? 'Task updated' : 'Task created', 'ok');
        if (existing) Views.taskDetail.mount(); else Views.tasks.mount();
      } }
    ]
  });
}

function openBlocksEditor(plant) {
  let gj;
  try { gj = JSON.parse(plant.LayoutGeoJSON); } catch (e) { UI.toast('No valid layout GeoJSON to edit', 'err'); return; }
  const feats = (gj && gj.type === 'FeatureCollection') ? gj.features : [gj];
  const html = feats.length ? feats.map((f, i) => {
    const name = (f.properties && (f.properties.name || f.properties.Name)) || '';
    return `<div class="row" style="gap:8px;margin:6px 0"><input id="blk_${i}" value="${UI.esc(name)}" placeholder="Block name"><span class="muted small">${UI.esc((f.geometry && f.geometry.type) || 'feature')}</span></div>`;
  }).join('') : '<div class="empty">No blocks found in layout</div>';
  UI.modal({
    title: 'Rename blocks — ' + plant.Name,
    html: `<p class="muted small">Fix any mislabeled blocks (e.g. rename the block wrongly shown as A8 to A7), then Save.</p>${html}`,
    actions: [
      { label: 'Cancel', cls: 'sec', onClick: (c) => c() },
      { label: 'Save', cls: '', onClick: async (c) => {
        feats.forEach((f, i) => { const v = document.getElementById('blk_' + i).value; f.properties = f.properties || {}; f.properties.name = v; });
        await API.call('plants.update', { plantId: plant.PlantID, layout: JSON.stringify(gj) });
        c(); UI.toast('Blocks updated', 'ok'); Views.settings.mount();
      } }
    ]
  });
}

/* ============================================================
   Views
   ============================================================ */
const Views = {

  setup: {
    html() {
      return `<div class="card"><h3>Setup</h3>
        <p class="muted">Paste the Google Apps Script Web App URL you deployed (see SETUP.md). The app stores it on this device only.</p>
        <label>API URL</label>
        <input id="api" placeholder="https://script.google.com/macros/s/.../exec" value="${UI.esc(State.apiBase)}">
        <button class="btn" id="saveBtn">Save &amp; Continue</button>
        <p class="muted small center" style="margin-top:10px">Data lives in Google Sheets · photos in your Drive</p></div>`;
    },
    mount() {
      document.getElementById('saveBtn').onclick = async () => {
        const v = document.getElementById('api').value.trim();
        if (!v) return UI.toast('Enter the API URL', 'err');
        saveApi(v);
        try {
          const d = await API.call('bootstrap', {}, { auth: false });
          State.settings = d.settings || {}; State.plants = d.plants || []; State.needsInit = !!d.needsInit;
          applyBranding();
          navigate(State.needsInit ? 'createAdmin' : 'login');
        } catch (e) { UI.toast(e.message, 'err'); }
      };
    }
  },

  createAdmin: {
    html() {
      return `<div class="card"><h3>Create first admin</h3>
        <p class="muted">No users exist yet. Create the admin account that will manage everything.</p>
        <label>Name</label><input id="name" placeholder="Site Manager">
        <label>Email</label><input id="email" type="email" placeholder="manager@company.com">
        <label>Password</label><input id="pw" type="password" placeholder="strong password">
        <button class="btn" id="createBtn">Create admin</button></div>`;
    },
    mount() {
      document.getElementById('createBtn').onclick = async () => {
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const pw = document.getElementById('pw').value;
        if (!name || !email || !pw) return UI.toast('All fields required', 'err');
        try {
          await API.call('admin.bootstrap', { name, email, password: pw }, { auth: false });
          UI.toast('Admin created', 'ok');
          navigate('login');
        } catch (e) { UI.toast(e.message, 'err'); }
      };
    }
  },

  login: {
    html() {
      return `<div class="card"><h3>Sign in</h3>
        <label>Email</label><input id="email" type="email" placeholder="you@company.com" value="">
        <label>Password</label><input id="pw" type="password" placeholder="••••••">
        <button class="btn" id="loginBtn">Sign in</button>
        <p class="muted small center" style="margin-top:10px">${UI.esc(State.settings.AppName || 'Solar Plant Manager')}</p></div>`;
    },
    mount() {
      document.getElementById('loginBtn').onclick = async () => {
        const email = document.getElementById('email').value.trim();
        const pw = document.getElementById('pw').value;
        if (!email || !pw) return UI.toast('Enter email and password', 'err');
        try {
          const d = await API.call('login', { email, password: pw }, { auth: false });
          saveSession(d.token, d.user);
          await bootstrap();
          startLive();
          navigate('dashboard');
        } catch (e) { UI.toast(e.message, 'err'); }
      };
    }
  },

  dashboard: {
    html() { return UI.spinner(); },
    async mount() {
      try {
        const [sum, att] = await Promise.all([
          API.call('dashboard', { plantId: currentPlantId() }),
          hasRole(['engineer', 'labour']) ? API.call('attendance.today', {}) : Promise.resolve({ open: null, today: [] })
        ]);
        const s = sum.summary;
        const openTasks = s.tasks.filter((t) => t.Status !== 'done').length;
        const plant = currentPlant();
        const html = `
          <div class="card">
            <div class="row between"><div><h3 style="margin:0">${UI.esc(State.user.name)}</h3>
            <div class="muted small">${UI.esc((plant && plant.Name) || 'No plant')} · ${UI.esc(State.user.role)}</div></div>
            ${hasRole(['engineer', 'labour']) ? `<button class="btn sec" id="attBtn" style="width:auto;margin:0">${att.open ? 'Check out' : 'Check in'}</button>` : ''}
            </div>
          </div>
          <div class="card grid2">
            <div class="hero-stat"><span class="n">${s.tasks.length}</span><span class="l">Labour tasks</span></div>
            <div class="hero-stat"><span class="n">${openTasks}</span><span class="l">Open tasks</span></div>
            <div class="hero-stat"><span class="n">${s.attendance.length}</span><span class="l">Present today</span></div>
            <div class="hero-stat"><span class="n">${s.locations.length}</span><span class="l">Engineers on map</span></div>
          </div>`;
        let extra = '';
        if (hasRole(['engineer', 'manager', 'admin']) && s.meters.length) {
          extra += `<div class="section-title">Latest meter readings</div>` + s.meters.slice().reverse().map((m) =>
            `<div class="card"><div class="row between"><b>${UI.esc(m.Date)}</b><span class="muted small">${UI.esc(m.ReadingTime || '')}</span></div>
             <div class="kv"><span>Import</span><b>${UI.esc(m.ImportKwh)} kWh</b></div>
             <div class="kv"><span>Export</span><b>${UI.esc(m.ExportKwh)} kWh</b></div></div>`).join('');
        }
        if (hasRole(['engineer', 'labour']) && att.today.length) {
          extra += `<div class="section-title">Your attendance today</div>` + att.today.map((a) =>
            `<div class="card"><span class="pill ${a.Status}">${a.Status}</span>
             <div class="kv"><span>In</span><b>${new Date(a.CheckInTime).toLocaleTimeString()}</b></div>
             ${a.CheckOutTime ? `<div class="kv"><span>Out</span><b>${new Date(a.CheckOutTime).toLocaleTimeString()}</b></div>` : ''}</div>`).join('');
        }
        document.getElementById('view').innerHTML = html + extra;
        const ab = document.getElementById('attBtn');
        if (ab) ab.onclick = () => navigate('attendance');
      } catch (e) { UI.toast(e.message, 'err'); document.getElementById('view').innerHTML = `<div class="empty">Failed to load.</div>`; }
    }
  },

  attendance: {
    html() { return UI.spin(); },
    async mount() {
      const d = await API.call('attendance.today', {});
      const reqPhoto = State.settings.AttendancePhoto === 'true';
      const html = `<div class="card">
        <h3>Attendance</h3>
        ${d.open ? `<p>You are <span class="pill open">checked in</span> since ${new Date(d.open.CheckInTime).toLocaleTimeString()}</p>
          <button class="btn" id="outBtn">Check out</button>`
          : `<p class="muted">You have not checked in today.</p>
          <button class="btn" id="inBtn">Check in</button>`}
        ${reqPhoto ? `<p class="muted small">A geotagged photo is required.</p>` : ''}
      </div>
      <div class="section-title">Today</div>
      ${d.today.length ? d.today.map((a) => `<div class="card"><span class="pill ${a.Status}">${a.Status}</span>
        <div class="kv"><span>In</span><b>${new Date(a.CheckInTime).toLocaleTimeString()}</b></div>
        ${a.CheckOutTime ? `<div class="kv"><span>Out</span><b>${new Date(a.CheckOutTime).toLocaleTimeString()}</b></div>` : ''}
        <div class="kv"><span>Location</span><b>${a.CheckInLat ? a.CheckInLat.toFixed(5) + ',' + a.CheckInLng.toFixed(5) : '-'}</b></div>
      </div>`).join('') : `<div class="empty">No records yet.</div>`}`;
      document.getElementById('view').innerHTML = html;

      const doCheck = async (type) => {
        let photoURL = '';
        if (reqPhoto) {
          try {
            const cap = await Media.capture({ label: type === 'in' ? 'CHECK-IN' : 'CHECK-OUT' });
            const up = await API.call('photo.upload', { base64: cap.base64, lat: cap.lat, lng: cap.lng, time: cap.time, plantId: currentPlantId(), filename: 'att_' + Date.now() + '.jpg' }, { queue: true });
            if (up.fileId) photoURL = up.url;
          } catch (e) { UI.toast('Photo skipped: ' + e.message); }
        }
        let geo = { lat: '', lng: '' };
        try { const g = await Media.getGeo(); geo = { lat: g.lat, lng: g.lng }; } catch (e) {}
        await API.call(type === 'in' ? 'attendance.checkIn' : 'attendance.checkOut',
          { lat: geo.lat, lng: geo.lng, photoURL, plantId: currentPlantId(), type: State.user.role }, { queue: true });
        UI.toast(type === 'in' ? 'Checked in' : 'Checked out', 'ok');
        Views.attendance.mount();
      };
      const ib = document.getElementById('inBtn'); if (ib) ib.onclick = () => doCheck('in');
      const ob = document.getElementById('outBtn'); if (ob) ob.onclick = () => doCheck('out');
    }
  },

  tasks: {
    html() { return UI.spinner(); },
    async mount() {
      const d = await API.call('tasks.list', { plantId: currentPlantId() });
      const canAdd = hasRole(['engineer', 'manager', 'admin']);
      const users = canAdd ? (await API.call('users.list', {})).users : [];
      const labour = users.filter((u) => u.Role === 'labour');
      let html = `<div class="card"><div class="row between"><h3 style="margin:0">Labour tasks</h3>${canAdd ? `<button class="btn sec" id="addBtn" style="width:auto;margin:0">+ New</button>` : ''}</div></div>`;
      if (!d.tasks.length) html += `<div class="empty">No tasks yet.</div>`;
      html += d.tasks.map((t) => {
        const names = (t.AssignedName || '').split(',').filter(Boolean).join(', ');
        return `<div class="card" data-id="${t.TaskID}">
          <div class="row between"><b>${UI.esc(t.Title)}</b><span class="pill ${t.Status}">${t.Status.replace('_', ' ')}</span></div>
          <div class="row" style="gap:6px;margin:6px 0;flex-wrap:wrap">
            <span class="pill" style="background:#eafaf1;color:#0b6e4f">${UI.esc(workLabel(t.WorkType))}</span>
            ${t.Shift ? `<span class="muted small">${UI.esc(t.Shift)}</span>` : ''}
            ${t.DurationHrs ? `<span class="muted small">· ${UI.esc(t.DurationHrs)}h</span>` : ''}
          </div>
          <div class="muted small">${names ? '👷 ' + UI.esc(names) : 'Unassigned'}${blockStr(t)}</div>
          ${t.WorkType === 'other' && t.OtherDetail ? `<p class="small" style="margin:4px 0 0">${UI.esc(t.OtherDetail)}</p>` : ''}
          ${t.Description ? `<p class="small" style="margin:4px 0 0">${UI.esc(t.Description)}</p>` : ''}
          <button class="btn sec openTask" style="margin-top:10px" data-id="${t.TaskID}">Open</button>
        </div>`;
      }).join('');
      document.getElementById('view').innerHTML = html;

      document.querySelectorAll('.openTask').forEach((b) => b.onclick = () => navigate('task/' + b.dataset.id));
      const ab = document.getElementById('addBtn');
      if (ab) ab.onclick = () => openTaskModal(labour, null);
    }
  },

  taskDetail: {
    html() { return UI.spinner(); },
    async mount() {
      const id = (location.hash || '').replace(/^#\/?/, '').split('/')[1];
      const [task, photos] = await Promise.all([
        API.call('tasks.list', { plantId: currentPlantId() }),
        API.call('task.photos', { taskId: id })
      ]);
      const t = task.tasks.find((x) => x.TaskID === id);
      if (!t) { document.getElementById('view').innerHTML = `<div class="empty">Task not found.</div>`; return; }
      const counts = (typeof State.settings.TaskPhotoCounts === 'object' && State.settings.TaskPhotoCounts) ? State.settings.TaskPhotoCounts : { before: 1, during: 1, after: 1 };
      const ph = photos.photos || [];
      const byPhase = (p) => ph.filter((x) => x.Phase === p);
      const canEdit = hasRole(['engineer', 'labour', 'manager', 'admin']);
      const canMeta = hasRole(['engineer', 'manager', 'admin']);
      const users = canMeta ? (await API.call('users.list', {})).users : [];
      const labour = users.filter((u) => u.Role === 'labour');
      const phaseHtml = (p) => {
        const have = byPhase(p);
        const need = counts[p] || 0;
        return `<div class="card">
          <div class="row between"><b>${p.toUpperCase()} photos</b><span class="muted small">${have.length}/${need}</span></div>
          <div class="photo-thumbs">${have.map((x) => `<img src="${UI.esc(x.URL)}" onclick="window.open('${UI.esc(x.URL)}')">`).join('')}</div>
          ${canEdit ? `<button class="photo-btn addPhoto" data-phase="${p}">+ ${p} photo</button>` : ''}
        </div>`;
      };
      const names = (t.AssignedName || '').split(',').filter(Boolean).join(', ');
      const html = `
        <div class="card">
          <div class="row between"><h3 style="margin:0">${UI.esc(t.Title)}</h3>
          <select id="statusSel">
            ${['todo', 'in_progress', 'done'].map((s) => `<option value="${s}" ${t.Status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
          </select></div>
          <div class="kv"><span>Work</span><b>${UI.esc(workLabel(t.WorkType))}${t.WorkType === 'other' && t.OtherDetail ? ' (' + UI.esc(t.OtherDetail) + ')' : ''}</b></div>
          <div class="kv"><span>Shift</span><b>${UI.esc(t.Shift || '-')}</b></div>
          <div class="kv"><span>Duration</span><b>${t.DurationHrs ? UI.esc(t.DurationHrs) + ' h' : '-'}</b></div>
          <div class="kv"><span>Assigned</span><b>${names || 'Unassigned'}</b></div>
          <div class="kv"><span>Blocks</span><b>${UI.esc((t.Blocks || t.BlockID || '-').split(',').filter(Boolean).join(', '))}</b></div>
          ${canMeta ? `<button class="btn sec" id="editBtn" style="margin-top:10px">Edit details</button>` : ''}
        </div>
        ${phaseHtml('before')}${phaseHtml('during')}${phaseHtml('after')}`;
      document.getElementById('view').innerHTML = html;

      document.getElementById('statusSel').onchange = async (e) => {
        await API.call('tasks.update', { taskId: id, status: e.target.value }, { queue: true });
        UI.toast('Status updated', 'ok');
      };
      const eb = document.getElementById('editBtn');
      if (eb) eb.onclick = () => openTaskModal(labour, t);
      document.querySelectorAll('.addPhoto').forEach((b) => b.onclick = async () => {
        const phase = b.dataset.phase;
        try {
          const cap = await Media.capture({ label: 'TASK ' + t.Title + ' / ' + phase.toUpperCase() });
          UI.toast('Saving photo to Drive…');
          await queuePhoto({ kind: 'task', taskId: id, phase, base64: cap.base64, lat: cap.lat, lng: cap.lng, time: cap.time, plantId: currentPlantId(), filename: 'task_' + id + '_' + phase + '_' + Date.now() + '.jpg' });
        } catch (e) { UI.toast('Camera failed: ' + e.message, 'err'); }
      });
    }
  },

  readings: {
    html() { return `
      <div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Readings</h3><button class="btn danger" id="clearDraft" style="width:auto;margin:0;padding:8px 12px">🗑 Start fresh</button></div>
      <div class="card"><h3>Meter readings</h3>
        <label>Date</label><input id="m_date" type="date" value="${todayStr()}">
        <div class="grid2">
          <div><label>Import (kWh)</label><input id="m_imp" type="number" step="0.01" placeholder="0"></div>
          <div><label>Export (kWh)</label><input id="m_exp" type="number" step="0.01" placeholder="0"></div>
        </div>
        <label>Reading time</label><input id="m_time" type="time" value="${nowTime()}">
        <div id="m_photos" class="photo-thumbs"></div>
        <button class="photo-btn" id="m_cap" style="margin-top:8px">+ Add meter photo</button>
        <button class="btn" id="m_save">Save meter reading</button>
      </div>
      <div class="card"><h3>Inverter generation</h3>
        <label>Inverter ID</label><input id="i_id" placeholder="INV-01">
        <label>Generation (kWh)</label><input id="i_gen" type="number" step="0.01" placeholder="0">
        <label>Reading time</label><input id="i_time" type="time" value="${nowTime()}">
        <div id="i_photos" class="photo-thumbs"></div>
        <button class="photo-btn" id="i_cap" style="margin-top:8px">+ Add inverter photo</button>
        <button class="btn" id="i_save">Save inverter reading</button>
      </div>`; },
    mount() {
      const draft = loadReadingsDraft() || { meter: {}, inverter: {}, mPhotos: [], iPhotos: [] };
      const $ = (id) => document.getElementById(id);
      if (draft.meter.date) $('m_date').value = draft.meter.date;
      if (draft.meter.imp != null) $('m_imp').value = draft.meter.imp;
      if (draft.meter.exp != null) $('m_exp').value = draft.meter.exp;
      if (draft.meter.time) $('m_time').value = draft.meter.time;
      if (draft.inverter.id) $('i_id').value = draft.inverter.id;
      if (draft.inverter.gen != null) $('i_gen').value = draft.inverter.gen;
      if (draft.inverter.time) $('i_time').value = draft.inverter.time;
      const renderThumbs = (el, arr) => { el.innerHTML = (arr || []).map((d) => `<img src="${d.dataUrl}">`).join(''); };
      renderThumbs($('m_photos'), draft.mPhotos);
      renderThumbs($('i_photos'), draft.iPhotos);
      const persist = () => {
        draft.meter = { date: $('m_date').value, imp: $('m_imp').value, exp: $('m_exp').value, time: $('m_time').value };
        draft.inverter = { id: $('i_id').value, gen: $('i_gen').value, time: $('i_time').value };
        saveReadingsDraft(draft);
      };
      ['m_date', 'm_imp', 'm_exp', 'm_time', 'i_id', 'i_gen', 'i_time'].forEach((id) => $(id).addEventListener('input', persist));
      $('m_cap').onclick = async () => {
        try { const c = await Media.capture({ label: 'METER' }); draft.mPhotos.push(c); persist(); renderThumbs($('m_photos'), draft.mPhotos); }
        catch (e) { UI.toast(e.message, 'err'); }
      };
      $('i_cap').onclick = async () => {
        try { const c = await Media.capture({ label: 'INVERTER' }); draft.iPhotos.push(c); persist(); renderThumbs($('i_photos'), draft.iPhotos); }
        catch (e) { UI.toast(e.message, 'err'); }
      };
      $('m_save').onclick = async () => {
        const ids = [];
        for (const c of (draft.mPhotos || [])) { const up = await API.call('photo.upload', { base64: c.base64, lat: c.lat, lng: c.lng, time: c.time, plantId: currentPlantId(), filename: 'meter_' + Date.now() + '.jpg' }, { queue: true }); if (up.url) ids.push(up.url); }
        let geo = { lat: '', lng: '' }; try { const g = await Media.getGeo(); geo = g; } catch (e) {}
        await API.call('meter.add', { date: $('m_date').value, importKwh: $('m_imp').value, exportKwh: $('m_exp').value, readingTime: $('m_time').value, photoURLs: ids.join('|'), lat: geo.lat, lng: geo.lng, plantId: currentPlantId() }, { queue: true });
        localStorage.removeItem('spm_readings_draft'); UI.toast('Meter reading saved', 'ok'); navigate('dashboard');
      };
      $('i_save').onclick = async () => {
        let url = '';
        if (draft.iPhotos && draft.iPhotos[0]) { const up = await API.call('photo.upload', { base64: draft.iPhotos[0].base64, lat: draft.iPhotos[0].lat, lng: draft.iPhotos[0].lng, time: draft.iPhotos[0].time, plantId: currentPlantId(), filename: 'inv_' + Date.now() + '.jpg' }, { queue: true }); if (up.url) url = up.url; }
        let geo = { lat: '', lng: '' }; try { const g = await Media.getGeo(); geo = g; } catch (e) {}
        await API.call('inverter.add', { inverterId: $('i_id').value, generationKwh: $('i_gen').value, readingTime: $('i_time').value, photoURL: url, lat: geo.lat, lng: geo.lng, plantId: currentPlantId() }, { queue: true });
        localStorage.removeItem('spm_readings_draft'); UI.toast('Inverter reading saved', 'ok'); navigate('dashboard');
      };
      const cd = $('clearDraft');
      if (cd) cd.onclick = () => {
        UI.confirm('Discard this draft and start fresh? Unsaved readings will be lost.').then((ok) => {
          if (!ok) return;
          localStorage.removeItem('spm_readings_draft');
          Views.readings.mount();
          UI.toast('Draft cleared', 'ok');
        });
      };
    }
  },

  map: {
    html() {
      const canEdit = hasRole(['manager', 'admin']);
      return `
      <div class="map-toggle">
        <button id="satBtn" class="active">Satellite</button>
        <button id="roadBtn">Roadmap</button>
      </div>
      ${canEdit ? `<button class="btn sec" id="editBlocksBtn" style="margin-bottom:10px">✏️ Edit blocks</button>
        <div id="blockList" class="card" style="display:none"></div>` : ''}
      <div id="map"></div>
      <p class="muted small center" id="mapNote">Loading…</p>`;
    },
    async mount() {
      const plant = currentPlant();
      const canEdit = hasRole(['manager', 'admin']);
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });
      const road = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' });
      const center = plant && plant.Lat ? [parseFloat(plant.Lat), parseFloat(plant.Lng)] : [20.5937, 78.9629];
      Live.map = L.map('map', { layers: [sat], zoomControl: true }).setView(center, plant && plant.Lat ? 16 : 5);
      L.control.layers({ Satellite: sat, Roadmap: road }, null, { position: 'topright' }).addTo(Live.map);
      document.getElementById('satBtn').onclick = () => { Live.map.removeLayer(road); Live.map.addLayer(sat); document.getElementById('satBtn').classList.add('active'); document.getElementById('roadBtn').classList.remove('active'); };
      document.getElementById('roadBtn').onclick = () => { Live.map.removeLayer(sat); Live.map.addLayer(road); document.getElementById('roadBtn').classList.add('active'); document.getElementById('satBtn').classList.remove('active'); };

      let layoutFC = parseLayout(plant);
      let stats = {};
      try { const td = await API.call('tasks.list', { plantId: currentPlantId() }); stats = computeBlockStats(td.tasks); } catch (e) {}

      const blockLayer = L.featureGroup();
      function blockColor(name) {
        const ds = stats[name] ? daysSince(stats[name].cleaned) : null;
        return ds == null ? '#0b6e4f' : (ds > 14 ? '#c0392b' : ds > 7 ? '#e08e0b' : '#1e9e6a');
      }
      function renderBlocks() {
        blockLayer.clearLayers();
        (layoutFC.features || []).forEach((f) => {
          const name = (f.properties && (f.properties.name || f.properties.Name)) || '';
          const g = L.geoJSON(f);
          const col = blockColor(name);
          g.setStyle({ color: col, weight: 2, fillColor: col, fillOpacity: 0.15 });
          g.eachLayer((lyr) => { lyr.bindPopup(blockPopup(name, stats[name])); blockLayer.addLayer(lyr); });
        });
      }
      renderBlocks();
      blockLayer.addTo(Live.map);

      function findLayer(name) {
        let found = null;
        blockLayer.eachLayer((l) => { if (l.feature && l.feature.properties && (l.feature.properties.name || l.feature.properties.Name) === name) found = l; });
        return found;
      }
      function saveLayout() {
        layoutFC = blockLayer.toGeoJSON();
        API.call('plants.update', { plantId: currentPlantId(), layout: JSON.stringify(layoutFC) }, { queue: true })
          .then(() => UI.toast('Layout saved', 'ok')).catch(() => UI.toast('Save failed (queued)', 'err'));
        if (!editing) renderBlocks();
        renderBlockList();
      }
      function renderBlockList() {
        const list = document.getElementById('blockList');
        if (!list) return;
        const feats = layoutFC.features || [];
        list.innerHTML = feats.length
          ? '<div class="section-title" style="margin:0 0 6px">Blocks / zones</div>' + feats.map((f, i) => {
              const n = (f.properties && (f.properties.name || f.properties.Name)) || ('#' + (i + 1));
              return `<div class="row between" style="padding:4px 0"><span>${UI.esc(n)}</span><span><button class="btn sec" style="width:auto;margin:0;padding:4px 8px" data-rn="${i}">Rename</button> <button class="btn danger" style="width:auto;margin:0;padding:4px 8px" data-del="${i}">Delete</button></span></div>`;
            }).join('')
          : '<div class="muted small">No blocks yet. Tap “Edit blocks” then draw a polygon/rectangle.</div>';
        list.querySelectorAll('[data-rn]').forEach((b) => b.onclick = () => {
          const i = +b.dataset.rn; const cur = (layoutFC.features[i].properties && (layoutFC.features[i].properties.name || layoutFC.features[i].properties.Name)) || '';
          const nv = prompt('Rename block / zone', cur); if (nv == null) return;
          const lyr = findLayer(cur); if (lyr) { lyr.feature.properties.name = nv; lyr.bindPopup(blockPopup(nv, stats[nv])); }
          layoutFC.features[i].properties = layoutFC.features[i].properties || {}; layoutFC.features[i].properties.name = nv;
          saveLayout();
        });
        list.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
          const i = +b.dataset.del; const cur = (layoutFC.features[i].properties && (layoutFC.features[i].properties.name || layoutFC.features[i].properties.Name)) || '';
          const lyr = findLayer(cur); if (lyr) blockLayer.removeLayer(lyr);
          layoutFC.features.splice(i, 1);
          saveLayout();
        });
      }

      let editing = false;
      function onCreate(e) {
        const lyr = e.layer;
        const n = prompt('Block / zone name?', 'Block ' + ((layoutFC.features || []).length + 1));
        const name = n || ('Block ' + ((layoutFC.features || []).length + 1));
        lyr.feature = lyr.feature || {}; lyr.feature.properties = lyr.feature.properties || {};
        lyr.feature.properties.name = name;
        const col = blockColor(name);
        lyr.setStyle({ color: col, weight: 2, fillColor: col, fillOpacity: 0.15 });
        lyr.bindPopup(blockPopup(name, stats[name]));
        blockLayer.addLayer(lyr);
        saveLayout();
      }

      if (canEdit && Live.map.pm) {
        const eb = document.getElementById('editBlocksBtn');
        eb.onclick = () => {
          editing = !editing;
          if (editing) {
            document.getElementById('blockList').style.display = 'block';
            Live.map.pm.addControls({ position: 'topleft', drawMarker: false, drawCircle: false, drawCircleMarker: false, drawPolyline: false, drawRectangle: true, drawPolygon: true, drawText: false, editMode: true, dragMode: true, cutPolygon: false, removalMode: true, rotateMode: false });
            Live.map.on('pm:create', onCreate);
            Live.map.on('pm:update', saveLayout);
            Live.map.on('pm:remove', saveLayout);
            eb.textContent = 'Done editing';
          } else {
            Live.map.pm.removeControls();
            Live.map.off('pm:create', onCreate);
            Live.map.off('pm:update', saveLayout);
            Live.map.off('pm:remove', saveLayout);
            eb.textContent = '✏️ Edit blocks';
            saveLayout();
          }
        };
        renderBlockList();
      } else if (canEdit) {
        UI.toast('Map editor needs internet on first load', 'err');
      }

      const drawLocs = (locs) => {
        Object.values(Live.markers).forEach((m) => Live.map.removeLayer(m)); Live.markers = {};
        (locs || []).forEach((l) => {
          if (l.Lat && l.Lng) {
            const m = L.circleMarker([parseFloat(l.Lat), parseFloat(l.Lng)], { radius: 8, color: '#0b6e4f', fillColor: '#1e9e6a', fillOpacity: 1 }).addTo(Live.map).bindPopup(`<b>${UI.esc(l.UserName)}</b><br>${new Date(l.UpdatedAt).toLocaleTimeString()}`);
            Live.markers[l.UserID] = m;
          }
        });
        if (Live.pos) {
          const me = L.circleMarker([Live.pos.lat, Live.pos.lng], { radius: 9, color: '#c0392b', fillColor: '#e74c3c', fillOpacity: 1 }).addTo(Live.map).bindPopup('You (live)');
          Live.markers['__me'] = me;
        }
      };
      const poll = async () => {
        try {
          const d = await API.call('location.list', { plantId: currentPlantId() });
          drawLocs(d.locations || []);
          document.getElementById('mapNote').textContent = (d.locations || []).length + ' engineer location(s) · ' + ((layoutFC.features || []).length) + ' blocks';
        } catch (e) {}
      };
      poll();
      Live.mapInterval = setInterval(poll, 15000);
    }
  },

  manager: {
    html() { return UI.spinner(); },
    async mount() {
      const d = await API.call('dashboard', { plantId: currentPlantId() });
      const s = d.summary;
      const html = `
        <div class="card">
          <h3>Operations overview</h3>
          <div class="grid2">
            <div class="hero-stat"><span class="n">${s.attendance.length}</span><span class="l">Present today</span></div>
            <div class="hero-stat"><span class="n">${s.tasks.filter((t) => t.Status !== 'done').length}</span><span class="l">Open tasks</span></div>
            <div class="hero-stat"><span class="n">${s.locations.length}</span><span class="l">Engineers tracked</span></div>
            <div class="hero-stat"><span class="n">${s.inverters.length}</span><span class="l">Inverter logs</span></div>
          </div>
          <button class="btn sec" id="mapBtn" style="margin-top:12px">View site map</button>
        </div>
        <div class="section-title">Attendance today</div>
        ${s.attendance.length ? s.attendance.map((a) => `<div class="card"><span class="pill ${a.Status}">${a.Status}</span> <b>${UI.esc(a.UserName)}</b>
          <div class="muted small">In ${new Date(a.CheckInTime).toLocaleTimeString()}${a.CheckOutTime ? ' · Out ' + new Date(a.CheckOutTime).toLocaleTimeString() : ''}</div></div>`).join('') : '<div class="empty">None</div>'}
        <div class="section-title">Recent inverter generation</div>
        ${s.inverters.length ? s.inverters.slice().reverse().slice(0, 8).map((i) => `<div class="card"><div class="row between"><b>${UI.esc(i.InverterID)}</b><span class="muted small">${UI.esc(i.Date)} ${UI.esc(i.ReadingTime || '')}</span></div>
          <div class="kv"><span>Generation</span><b>${UI.esc(i.GenerationKwh)} kWh</b></div></div>`).join('') : '<div class="empty">None</div>'}`;
      document.getElementById('view').innerHTML = html;
      document.getElementById('mapBtn').onclick = () => navigate('map');
    }
  },

  settings: {
    html() { return UI.spinner(); },
    async mount() {
      const s = State.settings;
      const counts = (typeof s.TaskPhotoCounts === 'object') ? s.TaskPhotoCounts : { before: 1, during: 1, after: 1 };
      const users = (await API.call('users.list', {})).users;
      const plants = (await API.call('plants.list', {})).plants;
      const html = `
        <div class="section-title">App branding</div>
        <div class="card">
          <label>App name</label><input id="s_name" value="${UI.esc(s.AppName || '')}">
          <label>Company name</label><input id="s_company" value="${UI.esc(s.CompanyName || '')}">
          <label>Logo URL</label><input id="s_logo" value="${UI.esc(s.LogoURL || '')}" placeholder="https://.../logo.png">
        </div>

        <div class="section-title">Management settings</div>
        <div class="card">
          <label>Periodic check-in interval (minutes)</label><input id="s_int" type="number" value="${UI.esc(s.CheckinIntervalMin || '15')}">
          <div class="grid2">
            <div><label>Required BEFORE photos</label><input id="s_b" type="number" min="0" value="${counts.before || 0}"></div>
            <div><label>Required DURING photos</label><input id="s_d" type="number" min="0" value="${counts.during || 0}"></div>
          </div>
          <label>Required AFTER photos</label><input id="s_a" type="number" min="0" value="${counts.after || 0}">
          <label class="row" style="gap:8px;margin-top:10px"><input type="checkbox" id="s_attphoto" style="width:auto" ${s.AttendancePhoto === 'true' ? 'checked' : ''}> Require photo on attendance check-in/out</label>
          <label class="row" style="gap:8px"><input type="checkbox" id="s_geo" style="width:auto" ${s.RequireGeoStamp !== 'false' ? 'checked' : ''}> Require geotag on all photos</label>
        </div>

        <div class="section-title">Photo storage (Google Drive)</div>
        <div class="card">
          <label>Drive type</label>
          <select id="s_dtype"><option value="mydrive" ${s.DriveType !== 'shared' ? 'selected' : ''}>My Drive folder</option><option value="shared" ${s.DriveType === 'shared' ? 'selected' : ''}>Company Shared Drive</option></select>
          <label>Folder ID</label><input id="s_folder" value="${UI.esc(s.DriveFolderId || '')}" placeholder="Folder or Shared Drive folder ID">
          <p class="muted small">Open the Drive folder in a browser; the ID is the long string in its URL.</p>
        </div>

        <button class="btn" id="saveSet">Save settings</button>

        <div class="section-title">Users</div>
        <div class="card">
          ${users.map((u) => `<div class="kv"><span>${UI.esc(u.Name)} <span class="muted small">(${UI.esc(u.Role)})</span></span><span class="muted small">${UI.esc(u.Email)}</span></div>`).join('')}
        </div>
        <button class="btn sec" id="addUser">+ Add user</button>

        <div class="section-title">Plants &amp; layout</div>
        <div class="card">
          ${plants.length ? plants.map((p) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">
            <div><b>${UI.esc(p.Name)}</b>${p.LayoutGeoJSON ? ' · layout ✓' : ''}<div class="muted small">${UI.esc(p.Lat || '-')}, ${UI.esc(p.Lng || '-')}</div></div>
            ${p.LayoutGeoJSON ? `<button class="btn sec" style="width:auto;margin:0" data-blocks="${UI.esc(p.PlantID)}">Rename blocks</button>` : ''}
          </div>`).join('') : '<div class="empty">No plants yet</div>'}
        </div>
        <button class="btn sec" id="addPlant">+ Add plant / import layout</button>

        <div class="section-title">Connection</div>
        <div class="card">
          <label>API URL (this device)</label><input id="s_api" value="${UI.esc(State.apiBase)}">
        </div>
        <div class="section-title">Sync &amp; drafts</div>
        <div class="card">
          <div class="kv"><span>Pending photo uploads</span><b id="pendingCount">…</b></div>
          <button class="btn danger" id="clearPending" style="margin-top:8px">Clear pending uploads</button>
          <p class="muted small">Photos captured but not yet synced (e.g. after a reload/offline). Clear only to discard them.</p>
        </div>
      `;
      document.getElementById('view').innerHTML = html;

      document.getElementById('saveSet').onclick = async () => {
        const obj = {
          AppName: document.getElementById('s_name').value,
          CompanyName: document.getElementById('s_company').value,
          LogoURL: document.getElementById('s_logo').value,
          CheckinIntervalMin: document.getElementById('s_int').value,
          TaskPhotoCounts: { before: +document.getElementById('s_b').value || 0, during: +document.getElementById('s_d').value || 0, after: +document.getElementById('s_a').value || 0 },
          AttendancePhoto: document.getElementById('s_attphoto').checked ? 'true' : 'false',
          RequireGeoStamp: document.getElementById('s_geo').checked ? 'true' : 'false',
          DriveType: document.getElementById('s_dtype').value,
          DriveFolderId: document.getElementById('s_folder').value
        };
        await API.call('settings.update', { settings: obj });
        saveApi(document.getElementById('s_api').value.trim());
        await bootstrap();
        UI.toast('Settings saved', 'ok');
      };

      document.getElementById('addUser').onclick = () => {
        UI.modal({
          title: 'Add user', html: `<label>Name</label><input id="u_name"><label>Email</label><input id="u_email" type="email"><label>Password</label><input id="u_pw" value="changeme"><label>Role</label><select id="u_role"><option value="engineer">Engineer</option><option value="labour">Labour</option><option value="manager">Manager</option><option value="admin">Admin</option></select>`,
          actions: [{ label: 'Cancel', cls: 'sec', onClick: (c) => c() }, { label: 'Add', cls: '', onClick: async (c) => {
            await API.call('users.add', { name: document.getElementById('u_name').value, email: document.getElementById('u_email').value, password: document.getElementById('u_pw').value, role: document.getElementById('u_role').value, plantId: currentPlantId() });
            c(); UI.toast('User added', 'ok'); Views.settings.mount();
          } }]
        });
      };

      document.getElementById('addPlant').onclick = () => {
        UI.modal({
          title: 'Add plant', dismissible: true,
          html: `<label>Name</label><input id="p_name"><div class="grid2"><div><label>Latitude</label><input id="p_lat"></div><div><label>Longitude</label><input id="p_lng"></div></div>
            <label>Layout (GeoJSON)</label><textarea id="p_layout" placeholder="Paste GeoJSON or import a .geojson file"></textarea>
            <button class="photo-btn" id="p_import" style="margin-top:6px">Import .geojson file</button>
            <input type="file" id="p_file" accept=".geojson,.json,application/geo+json" style="display:none">`,
          onOpen: (box) => {
            box.querySelector('#p_import').onclick = () => box.querySelector('#p_file').click();
            box.querySelector('#p_file').onchange = async (e) => {
              const f = e.target.files[0]; if (!f) return;
              const txt = await f.text();
              try { JSON.parse(txt); box.querySelector('#p_layout').value = txt; UI.toast('Layout loaded', 'ok'); }
              catch (err) { UI.toast('Invalid GeoJSON', 'err'); }
            };
          },
          actions: [{ label: 'Cancel', cls: 'sec', onClick: (c) => c() }, { label: 'Add', cls: '', onClick: async (c) => {
            let layout = box.querySelector('#p_layout').value.trim();
            if (layout) { try { JSON.parse(layout); } catch (e) { return UI.toast('Layout is not valid JSON', 'err'); } }
            await API.call('plants.add', { name: box.querySelector('#p_name').value, lat: box.querySelector('#p_lat').value, lng: box.querySelector('#p_lng').value, layout, plantId: '' });
            c(); UI.toast('Plant added', 'ok'); Views.settings.mount();
          } }]
        });
      };
      document.querySelectorAll('[data-blocks]').forEach((b) => b.onclick = () => {
        const pl = plants.find((x) => x.PlantID === b.dataset.blocks);
        if (pl) openBlocksEditor(pl);
      });
      PhotoOutbox.all().then((items) => { const el = document.getElementById('pendingCount'); if (el) el.textContent = items.length; }).catch(() => {});
      const cp = document.getElementById('clearPending');
      if (cp) cp.onclick = () => {
        UI.confirm('Discard all pending (unsynced) photos? They will NOT be uploaded.').then(async (ok) => {
          if (!ok) return;
          const items = await PhotoOutbox.all().catch(() => []);
          for (const it of items) { await PhotoOutbox.remove(it._id).catch(() => {}); }
          const el = document.getElementById('pendingCount'); if (el) el.textContent = '0';
          UI.toast('Pending uploads cleared', 'ok');
        });
      };
    }
  }
};

/* taskDetail route alias */
Views.task = Views.taskDetail;

window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', init);
