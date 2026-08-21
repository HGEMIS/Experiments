/* ============================================================
   DB.gs  -  Google Sheets data layer (no external DB needed)
   The script is BOUND to the spreadsheet that holds the data,
   so SpreadsheetApp.getActiveSpreadsheet() returns it.
   ============================================================ */

function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  var ss = getSS();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

var SCHEMA = {
  Settings:        ['Key', 'Value'],
  Users:           ['UserID', 'Name', 'Email', 'Role', 'PasswordHash', 'Salt', 'PlantID', 'Active', 'CreatedAt'],
  Plants:          ['PlantID', 'Name', 'Lat', 'Lng', 'LayoutGeoJSON', 'CreatedAt'],
  Attendance:      ['ID', 'PlantID', 'UserID', 'UserName', 'Type', 'Date', 'CheckInTime', 'CheckInLat', 'CheckInLng', 'CheckOutTime', 'CheckOutLat', 'CheckOutLng', 'PhotoURL', 'Status', 'CreatedAt'],
  CheckIns:        ['ID', 'PlantID', 'UserID', 'UserName', 'Time', 'Lat', 'Lng', 'Accuracy'],
  LabourTasks:     ['TaskID', 'PlantID', 'Title', 'Description', 'WorkType', 'OtherDetail', 'AssignedTo', 'AssignedName', 'Shift', 'DurationHrs', 'Status', 'BlockID', 'Blocks', 'DueDate', 'CreatedAt', 'CreatedBy'],
  TaskPhotos:      ['ID', 'TaskID', 'Phase', 'FileID', 'URL', 'Lat', 'Lng', 'Time', 'Hash', 'UploadedBy'],
  MeterReadings:   ['ID', 'PlantID', 'Date', 'ImportKwh', 'ExportKwh', 'ReadingTime', 'PhotoURLs', 'Lat', 'Lng', 'EnteredBy', 'CreatedAt'],
  InverterReadings:['ID', 'PlantID', 'Date', 'InverterID', 'GenerationKwh', 'ReadingTime', 'PhotoURL', 'Lat', 'Lng', 'EnteredBy', 'CreatedAt'],
  LiveLocation:    ['PlantID', 'UserID', 'UserName', 'Lat', 'Lng', 'Accuracy', 'UpdatedAt'],
  PhotoLog:        ['ID', 'UserID', 'PlantID', 'Lat', 'Lng', 'Time', 'FileID', 'URL', 'Hash'],
  Sessions:        ['Token', 'UserID', 'Role', 'Name', 'PlantID', 'Expires']
};

// Additive schema sync: never wipes data. Creates the sheet if missing and
// appends any new columns at the end (old rows simply get empty cells there).
function ensureSchema() {
  for (var name in SCHEMA) {
    var sh = getSheet(name);
    var lastRow = sh.getLastRow();
    var hdr = (lastRow && lastRow >= 1) ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    SCHEMA[name].forEach(function (col) {
      if (hdr.indexOf(col) < 0) {
        hdr.push(col);
        sh.getRange(1, hdr.length).setValue(col);
      }
    });
  }
  seedSettings();
}

// Insert a row by mapping an object's keys to the sheet's header columns,
// so column re-ordering never breaks writes.
function insertRow(name, obj) {
  var sh = getSheet(name);
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = hdr.map(function (col) { return obj[col] !== undefined ? obj[col] : ''; });
  sh.appendRow(row);
}

function seedSettings() {
  var rows = readRows('Settings');
  if (rows.length === 0) {
    setSetting('AppName', 'Solar Plant Manager');
    setSetting('LogoURL', '');
    setSetting('CompanyName', '');
    setSetting('CheckinIntervalMin', '15');
    setSetting('TaskPhotoCounts', JSON.stringify({ before: 1, during: 1, after: 1 }));
    setSetting('AttendancePhoto', 'false');
    setSetting('RequireGeoStamp', 'true');
    setSetting('DriveType', 'mydrive');   // 'mydrive' or 'shared'
    setSetting('DriveFolderId', '');
  }
}

function readRows(name) {
  var sh = getSheet(name);
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i].join('').trim() === '') continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
    out.push(obj);
  }
  return out;
}

function appendRow(name, values) {
  getSheet(name).appendRow(values);
}

function findRow(name, idCol, idVal) {
  var rows = readRows(name);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(idVal)) return rows[i];
  }
  return null;
}

function updateRow(name, idCol, idVal, updates) {
  var sh = getSheet(name);
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var colIdx = headers.indexOf(idCol);
  if (colIdx < 0) return false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(idVal)) {
      for (var k in updates) {
        var ci = headers.indexOf(k);
        if (ci >= 0) sh.getRange(i + 1, ci + 1).setValue(updates[k]);
      }
      return true;
    }
  }
  return false;
}

function getSettings() {
  var rows = readRows('Settings');
  var s = {};
  rows.forEach(function (r) {
    var v = r.Value;
    if (typeof v === 'string' && (v.charAt(0) === '{' || v.charAt(0) === '[')) {
      try { v = JSON.parse(v); } catch (e) {}
    }
    s[r.Key] = v;
  });
  return s;
}

function setSetting(key, value) {
  var sh = getSheet('Settings');
  var v = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) { sh.getRange(i + 1, 2).setValue(v); return; }
  }
  sh.appendRow([key, v]);
}

function updateSettingsBulk(obj) {
  for (var k in obj) setSetting(k, obj[k]);
}

function newId(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
}

function fmtDate(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
