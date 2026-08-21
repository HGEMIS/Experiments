/* ============================================================
   Storage.gs  -  Photo upload to Google Drive (My Drive or
   company Shared Drive). The deploying user's identity is used,
   so field workers never see an auth popup.
   ============================================================ */

function savePhotoToDrive(filename, blob) {
  var s = getSettings();
  var folderId = s.DriveFolderId || '';
  var type = s.DriveType || 'mydrive';
  if (!folderId) throw new Error('Drive folder not configured. Set DriveFolderId in Settings (Management Settings).');
  if (type === 'shared') {
    return uploadToSharedDrive(folderId, blob, filename);
  }
  return uploadToMyDrive(folderId, blob, filename);
}

/* Shared Drive (Team Drive) path via the Advanced Drive Service.
   Requires the script's Cloud project to have the Drive API enabled
   and the deploying user to be an Editor on the Shared Drive. */
function uploadToSharedDrive(folderId, blob, filename) {
  var resource = {
    title: filename,
    mimeType: blob.getContentType(),
    parents: [{ id: folderId }]
  };
  var file = Drive.Files.insert(resource, blob, { supportsAllDrives: true });
  return {
    id: file.id,
    url: file.alternateLink || ('https://drive.google.com/file/d/' + file.id + '/view')
  };
}

/* Ordinary My Drive folder path (no advanced service needed). */
function uploadToMyDrive(folderId, blob, filename) {
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  return {
    id: file.getId(),
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view'
  };
}

function hexDigest(bytes) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return d.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
