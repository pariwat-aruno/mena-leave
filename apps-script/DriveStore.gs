/**
 * DriveStore.gs — รับ base64 → upload Drive → return URL
 *
 * subfolder enum: 'leave-proofs'
 * permission: anyone with link, viewer
 */

const DRIVE_SUBFOLDER_PROP_KEY = {
  'leave-proofs': 'DRIVE_FOLDER_LEAVE_PROOFS',
};

/**
 * upload base64 image → Drive → คืน public URL
 *
 * @param {string} base64 — data URL (data:image/...;base64,xxx) หรือ raw base64
 * @param {string} filename
 * @param {string} subfolder — 'leave-proofs'
 * @return {string} public URL ที่ดู preview ได้
 */
function uploadImage(base64, filename, subfolder) {
  if (!base64) throw new Error('uploadImage: base64 ว่าง');
  if (!filename) throw new Error('uploadImage: filename ว่าง');
  const propKey = DRIVE_SUBFOLDER_PROP_KEY[subfolder];
  if (!propKey) throw new Error('uploadImage: subfolder ไม่รู้จัก ' + subfolder);

  const folderId = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!folderId) throw new Error('uploadImage: ' + propKey + ' not set');

  // strip data: prefix ถ้ามี
  let raw = base64;
  let mimeType = 'image/jpeg';
  const m = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (m) {
    mimeType = m[1];
    raw = m[2];
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(raw);
  } catch (err) {
    logError('uploadImage', 'base64 decode failed', { filename: filename, err: err.message });
    throw new Error('invalid_base64');
  }

  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const folder = DriveApp.getFolderById(folderId);
  const file = folder.createFile(blob);

  // permission: anyone with link, viewer
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    logWarn('uploadImage', 'setSharing failed: ' + err.message, { fileId: file.getId() });
  }

  return file.getUrl();
}

/**
 * แปลง Drive URL `/file/d/.../view` → thumbnail URL ที่ render ใน LINE Flex ได้
 */
function driveUrlToThumbnail_(url) {
  if (!url) return '';
  const m = String(url).match(/\/file\/d\/([^\/\?]+)/);
  if (!m) return url;
  return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
}
