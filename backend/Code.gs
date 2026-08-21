/* ============================================================
   Code.gs  -  Solar Plant Management API (Google Apps Script)
   Deployed as a Web App: Execute as [Me], Who has access: [Anyone].
   All writes happen under the deployer's account -> no user popups.
   ============================================================ */

function doGet(e) {
  return json({ ok: true, service: 'SolarPlantAPI', version: '1.0', note: 'Send POST {action:...}' });
}

// CORS preflight handler (harmless; our client sends a "simple" text/plain
// request so browsers normally skip the preflight, but this covers edge cases).
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

function doPost(e) {
  try {
    ensureSchema();
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
    }
    var action = body.action;
    if (!action) return json({ ok: false, error: 'Missing action' });
    var res = handle(action, body);
    return json(res);
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({ 'Access-Control-Allow-Origin': '*' });
}

function handle(action, body) {
  switch (action) {
    case 'admin.bootstrap':  return actionAdminBootstrap(body);
    case 'login':            return actionLogin(body);
    case 'logout':           return actionLogout(body);
    case 'bootstrap':        return actionBootstrap(body);

    case 'settings.update':  return guard(body, ['manager', 'admin'], actionSettingsUpdate);

    case 'users.list':       return guard(body, ['engineer', 'manager', 'admin'], actionUsersList);
    case 'users.add':        return guard(body, ['manager', 'admin'], actionUserAdd);
    case 'users.update':     return guard(body, ['manager', 'admin'], actionUserUpdate);
    case 'users.delete':     return guard(body, ['manager', 'admin'], actionUserDelete);

    case 'plants.list':      return guard(body, null, actionPlantsList);
    case 'plants.add':       return guard(body, ['manager', 'admin'], actionPlantAdd);
    case 'plants.update':    return guard(body, ['manager', 'admin'], actionPlantUpdate);

    case 'attendance.checkIn': return guard(body, ['engineer', 'labour', 'manager', 'admin'], actionAttendanceCheckIn);
    case 'attendance.checkOut':return guard(body, ['engineer', 'labour', 'manager', 'admin'], actionAttendanceCheckOut);
    case 'attendance.today':   return guard(body, ['engineer', 'labour', 'manager', 'admin'], actionAttendanceToday);
    case 'attendance.list':    return guard(body, ['manager', 'admin'], actionAttendanceList);

    case 'checkin':          return guard(body, ['engineer', 'labour'], actionCheckIn);
    case 'location.update':  return guard(body, ['engineer'], actionLocationUpdate);
    case 'location.list':    return guard(body, null, actionLocationList);

    case 'tasks.list':       return guard(body, null, actionTasksList);
    case 'tasks.add':        return guard(body, ['engineer', 'manager', 'admin'], actionTaskAdd);
    case 'tasks.update':     return guard(body, ['engineer', 'manager', 'admin'], actionTaskUpdate);
    case 'task.photo.add':   return guard(body, ['engineer', 'labour'], actionTaskPhotoAdd);
    case 'task.photos':      return guard(body, null, actionTaskPhotos);

    case 'meter.add':        return guard(body, ['engineer', 'manager', 'admin'], actionMeterAdd);
    case 'inverter.add':     return guard(body, ['engineer', 'manager', 'admin'], actionInverterAdd);
    case 'photo.upload':     return guard(body, ['engineer', 'labour', 'manager', 'admin'], actionPhotoUpload);

    case 'dashboard':        return guard(body, null, actionDashboard);

    default: return { ok: false, error: 'Unknown action: ' + action };
  }
}

/* ---------- auth helpers ---------- */
function hashPassword(pw, salt) {
  var bytes = Utilities.computeHmacSha256Signature(pw, salt);
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function requireSession(body) {
  var token = body.token;
  if (!token) return null;
  var sh = getSheet('Sessions');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      if (data[i][5] && new Date(data[i][5]).getTime() > Date.now()) {
        return { token: data[i][0], userId: data[i][1], role: data[i][2], name: data[i][3], plantId: data[i][4] };
      }
      sh.deleteRow(i + 1); // expired
      return null;
    }
  }
  return null;
}

function guard(body, roles, fn) {
  var s = requireSession(body);
  if (!s) return { ok: false, error: 'Authentication required' };
  if (roles && roles.indexOf(s.role) < 0) return { ok: false, error: 'Not permitted' };
  return fn(body, s);
}

/* ---------- actions ---------- */
function actionAdminBootstrap(body) {
  var users = readRows('Users');
  if (users.length > 0) return { ok: false, error: 'Users already exist. Ask an admin to add you.' };
  var salt = Utilities.getUuid();
  var hash = hashPassword(body.password || 'admin123', salt);
  appendRow('Users', [newId('U'), body.name || 'Admin', body.email, 'admin', hash, salt, '', 'true', new Date().toISOString()]);
  return { ok: true };
}

function actionLogin(body) {
  if (!body.email || !body.password) return { ok: false, error: 'Email and password required' };
  var users = readRows('Users');
  var u = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].Email && users[i].Email.toLowerCase() === String(body.email).toLowerCase() && users[i].Active !== 'false') { u = users[i]; break; }
  }
  if (!u) return { ok: false, error: 'Invalid email or password' };
  if (hashPassword(body.password, u.Salt) !== u.PasswordHash) return { ok: false, error: 'Invalid email or password' };
  var token = Utilities.getUuid();
  var expiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  appendRow('Sessions', [token, u.UserID, u.Role, u.Name, u.PlantID, expiry]);
  return { ok: true, token: token, user: { id: u.UserID, name: u.Name, email: u.Email, role: u.Role, plantId: u.PlantID } };
}

function actionLogout(body) {
  var token = body.token;
  if (token) {
    var sh = getSheet('Sessions');
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) { if (data[i][0] === token) { sh.deleteRow(i + 1); break; } }
  }
  return { ok: true };
}

function actionBootstrap(body) {
  var s = requireSession(body);
  var settings = getSettings();
  var plants = readRows('Plants');
  var user = null;
  if (s) {
    var u = findRow('Users', 'UserID', s.userId);
    if (u) user = { id: u.UserID, name: u.Name, email: u.Email, role: u.Role, plantId: u.PlantID };
  }
  return { ok: true, settings: settings, plants: plants, user: user, needsInit: readRows('Users').length === 0 };
}

function actionSettingsUpdate(body, s) {
  var obj = body.settings || {};
  updateSettingsBulk(obj);
  return { ok: true };
}

/* users */
function actionUsersList(body, s) {
  var rows = readRows('Users').map(function (u) {
    var c = {}; for (var k in u) if (k !== 'PasswordHash' && k !== 'Salt') c[k] = u[k];
    return c;
  });
  return { ok: true, users: rows };
}
function actionUserAdd(body, s) {
  var exist = readRows('Users').filter(function (u) { return u.Email && u.Email.toLowerCase() === String(body.email).toLowerCase(); });
  if (exist.length) return { ok: false, error: 'Email already exists' };
  var salt = Utilities.getUuid();
  var hash = hashPassword(body.password || 'changeme', salt);
  var id = newId('U');
  appendRow('Users', [id, body.name, body.email, body.role || 'labour', hash, salt, body.plantId || '', body.active !== false ? 'true' : 'false', new Date().toISOString()]);
  return { ok: true, id: id };
}
function actionUserUpdate(body, s) {
  var upd = {};
  if (body.name !== undefined) upd.Name = body.name;
  if (body.email !== undefined) upd.Email = body.email;
  if (body.role !== undefined) upd.Role = body.role;
  if (body.plantId !== undefined) upd.PlantID = body.plantId;
  if (body.active !== undefined) upd.Active = body.active ? 'true' : 'false';
  if (body.password) { upd.PasswordHash = hashPassword(body.password, findRow('Users', 'UserID', body.userId).Salt); }
  updateRow('Users', 'UserID', body.userId, upd);
  return { ok: true };
}
function actionUserDelete(body, s) {
  var sh = getSheet('Users');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === body.userId) { sh.deleteRow(i + 1); break; }
  }
  return { ok: true };
}

/* plants */
function actionPlantsList(body, s) { return { ok: true, plants: readRows('Plants') }; }
function actionPlantAdd(body, s) {
  var id = newId('P');
  appendRow('Plants', [id, body.name, body.lat || '', body.lng || '', body.layout || '', new Date().toISOString()]);
  return { ok: true, id: id };
}
function actionPlantUpdate(body, s) {
  var upd = {};
  if (body.name !== undefined) upd.Name = body.name;
  if (body.lat !== undefined) upd.Lat = body.lat;
  if (body.lng !== undefined) upd.Lng = body.lng;
  if (body.layout !== undefined) upd.LayoutGeoJSON = body.layout;
  updateRow('Plants', 'PlantID', body.plantId, upd);
  return { ok: true };
}

/* attendance */
function findOpenAttendance(userId) {
  var rows = readRows('Attendance');
  for (var i = 0; i < rows.length; i++) if (rows[i].UserID === userId && rows[i].Status === 'open') return rows[i];
  return null;
}
function actionAttendanceCheckIn(body, s) {
  if (findOpenAttendance(s.userId)) return { ok: false, error: 'Already checked in. Check out first.' };
  var id = newId('A');
  var now = new Date();
  appendRow('Attendance', [id, body.plantId || s.plantId || '', s.userId, s.name, body.type || s.role, fmtDate(now), now.toISOString(), body.lat || '', body.lng || '', '', '', '', body.photoURL || '', 'open', now.toISOString()]);
  return { ok: true, id: id, message: 'Checked in' };
}
function actionAttendanceCheckOut(body, s) {
  var open = findOpenAttendance(s.userId);
  if (!open) return { ok: false, error: 'No open check-in.' };
  var now = new Date();
  updateRow('Attendance', 'ID', open.ID, { CheckOutTime: now.toISOString(), CheckOutLat: body.lat || '', CheckOutLng: body.lng || '', Status: 'closed' });
  return { ok: true, message: 'Checked out' };
}
function actionAttendanceToday(body, s) {
  var open = findOpenAttendance(s.userId);
  var rows = readRows('Attendance').filter(function (r) { return r.UserID === s.userId && r.Date === fmtDate(new Date()); });
  return { ok: true, open: open, today: rows };
}
function actionAttendanceList(body, s) {
  var plantId = body.plantId || s.plantId || '';
  var rows = readRows('Attendance').filter(function (r) { return !plantId || r.PlantID === plantId; });
  return { ok: true, attendance: rows };
}

/* periodic check-in + live location */
function actionCheckIn(body, s) {
  appendRow('CheckIns', [newId('C'), body.plantId || s.plantId || '', s.userId, s.name, new Date().toISOString(), body.lat || '', body.lng || '', body.accuracy || '']);
  return { ok: true };
}
function actionLocationUpdate(body, s) {
  var plantId = body.plantId || s.plantId || '';
  var sh = getSheet('LiveLocation');
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var ciP = headers.indexOf('PlantID'), ciU = headers.indexOf('UserID'), ciLat = headers.indexOf('Lat'), ciLng = headers.indexOf('Lng'), ciA = headers.indexOf('Accuracy'), ciT = headers.indexOf('UpdatedAt');
  for (var i = 1; i < data.length; i++) {
    if (data[i][ciP] === plantId && data[i][ciU] === s.userId) {
      sh.getRange(i + 1, ciLat + 1).setValue(body.lat);
      sh.getRange(i + 1, ciLng + 1).setValue(body.lng);
      sh.getRange(i + 1, ciA + 1).setValue(body.accuracy || '');
      sh.getRange(i + 1, ciT + 1).setValue(new Date().toISOString());
      return { ok: true };
    }
  }
  appendRow('LiveLocation', [plantId, s.userId, s.name, body.lat || '', body.lng || '', body.accuracy || '', new Date().toISOString()]);
  return { ok: true };
}
function actionLocationList(body, s) {
  var plantId = body.plantId || s.plantId || '';
  var rows = readRows('LiveLocation').filter(function (r) { return !plantId || r.PlantID === plantId; });
  return { ok: true, locations: rows };
}

/* labour tasks */
function actionTasksList(body, s) {
  var rows = readRows('LabourTasks');
  if (s.role === 'labour') rows = rows.filter(function (r) { return r.AssignedTo === s.userId; });
  else if (s.role === 'engineer') rows = rows.filter(function (r) { return r.PlantID === s.plantId; });
  return { ok: true, tasks: rows };
}
function actionTaskAdd(body, s) {
  var id = newId('T');
  appendRow('LabourTasks', [id, body.plantId || s.plantId || '', body.title || 'Untitled', body.description || '', body.assignedTo || '', body.assignedName || '', body.status || 'todo', body.blockId || '', body.dueDate || '', new Date().toISOString(), s.userId]);
  return { ok: true, id: id };
}
function actionTaskUpdate(body, s) {
  var upd = {};
  ['Title', 'Description', 'AssignedTo', 'AssignedName', 'Status', 'BlockID', 'DueDate'].forEach(function (k) {
    if (body[k.charAt(0).toLowerCase() + k.slice(1)] !== undefined) upd[k] = body[k.charAt(0).toLowerCase() + k.slice(1)];
  });
  updateRow('LabourTasks', 'TaskID', body.taskId, upd);
  return { ok: true };
}
function actionTaskPhotoAdd(body, s) {
  var id = newId('TP');
  appendRow('TaskPhotos', [id, body.taskId, body.phase, body.fileId, body.url, body.lat, body.lng, body.time || new Date().toISOString(), body.hash || '', s.userId]);
  return { ok: true, id: id };
}
function actionTaskPhotos(body, s) {
  var rows = readRows('TaskPhotos').filter(function (r) { return r.TaskID === body.taskId; });
  return { ok: true, photos: rows };
}

/* meter + inverter readings */
function actionMeterAdd(body, s) {
  var id = newId('M');
  var urls = Array.isArray(body.photoFileIds) ? body.photoFileIds.join('|') : (body.photoURLs || '');
  appendRow('MeterReadings', [id, body.plantId || s.plantId || '', body.date || fmtDate(new Date()), body.importKwh || '', body.exportKwh || '', body.readingTime || '', urls, body.lat || '', body.lng || '', s.userId, new Date().toISOString()]);
  return { ok: true, id: id };
}
function actionInverterAdd(body, s) {
  var id = newId('I');
  appendRow('InverterReadings', [id, body.plantId || s.plantId || '', body.date || fmtDate(new Date()), body.inverterId || '', body.generationKwh || '', body.readingTime || '', body.photoURL || body.photoFileId || '', body.lat || '', body.lng || '', s.userId, new Date().toISOString()]);
  return { ok: true, id: id };
}

/* photo upload (base64 -> Drive) */
function actionPhotoUpload(body, s) {
  var b64 = body.base64 || '';
  var ci = b64.indexOf(',');
  if (ci >= 0) b64 = b64.substring(ci + 1);
  if (!b64) return { ok: false, error: 'No image data' };
  var bytes = Utilities.base64Decode(b64);
  var mime = body.mime || 'image/jpeg';
  var filename = body.filename || ('photo_' + Date.now() + '.jpg');
  var blob = Utilities.newBlob(bytes, mime, filename);
  var saved = savePhotoToDrive(filename, blob);
  var hash = hexDigest(bytes);
  var id = newId('PH');
  appendRow('PhotoLog', [id, s.userId, body.plantId || s.plantId || '', body.lat || '', body.lng || '', body.time || new Date().toISOString(), saved.id, saved.url, hash]);
  return { ok: true, fileId: saved.id, url: saved.url, hash: hash, photoLogId: id };
}

/* manager dashboard summary */
function actionDashboard(body, s) {
  var plantId = body.plantId || s.plantId || '';
  var tasks = readRows('LabourTasks').filter(function (r) { return !plantId || r.PlantID === plantId; });
  var attendance = readRows('Attendance').filter(function (r) { return (!plantId || r.PlantID === plantId) && r.Date === fmtDate(new Date()); });
  var meters = readRows('MeterReadings').filter(function (r) { return !plantId || r.PlantID === plantId; }).slice(-5);
  var inv = readRows('InverterReadings').filter(function (r) { return !plantId || r.PlantID === plantId; }).slice(-10);
  var locations = readRows('LiveLocation').filter(function (r) { return !plantId || r.PlantID === plantId; });
  return { ok: true, summary: { tasks: tasks, attendance: attendance, meters: meters, inverters: inv, locations: locations } };
}
