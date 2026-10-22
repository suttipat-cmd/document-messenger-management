/**
 * Service Management — private Google Drive bridge, protocol v1.
 * Only Supabase Edge Functions call doPost. Never call from the frontend.
 * Run initializeBridge once, then deploy a Web app: execute as Me, access Anyone.
 * Keep BRIDGE_SECRET in Script Properties and Supabase Secrets only.
 */
const DRIVE_BRIDGE_FOLDER = '11Iyc7T1iJdhRzUOmow_rIUx8bvu8om1O';
const DRIVE_BRIDGE_MAX_BYTES = 2 * 1024 * 1024;
const DRIVE_BRIDGE_MAX_REQUEST = 3 * 1024 * 1024;

function initializeBridge() {
  const folder = DriveApp.getFolderById(DRIVE_BRIDGE_FOLDER);
  if (folder.isTrashed()) throw new Error('Destination folder is in Trash');
  const props = PropertiesService.getScriptProperties();
  // Rerunning setup never silently rotates the shared secret.
  if (!props.getProperty('BRIDGE_SECRET')) {
    props.setProperty('BRIDGE_SECRET',
      Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  props.setProperty('DRIVE_FOLDER_ID', DRIVE_BRIDGE_FOLDER);
  console.log('Ready: ' + folder.getName() + '. Find BRIDGE_SECRET in Project Settings > Script Properties. Do not paste it into chat or source code.');
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({error: 'POST_REQUIRED'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let secret = '';
  let requestNonce = '';
  let authenticated = false;
  try {
    const props = PropertiesService.getScriptProperties();
    secret = props.getProperty('BRIDGE_SECRET') || '';
    if (secret.length < 32) throw new Error('NOT_CONFIGURED');
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > DRIVE_BRIDGE_MAX_REQUEST) throw new Error('INVALID_REQUEST');
    const envelope = JSON.parse(raw);
    if (envelope.v !== 1 || typeof envelope.payload !== 'string' ||
        typeof envelope.nonce !== 'string' || !/^[a-f0-9-]{36}$/i.test(envelope.nonce) ||
        !Number.isSafeInteger(envelope.ts) || Math.abs(Date.now() - envelope.ts) > 120000 ||
        typeof envelope.signature !== 'string') throw new Error('UNAUTHORIZED');
    requestNonce = envelope.nonce;
    const signed = 'v1\n' + envelope.ts + '\n' + requestNonce + '\n' + envelope.payload;
    if (!bridgeEqual_(bridgeHmac_(signed, secret), envelope.signature)) throw new Error('UNAUTHORIZED');
    authenticated = true;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('BUSY');
    try {
      const cache = CacheService.getScriptCache();
      const nonceKey = 'v1:' + requestNonce;
      if (cache.get(nonceKey)) throw new Error('REPLAY');
      cache.put(nonceKey, '1', 300);
      const payload = JSON.parse(envelope.payload);
      const folderId = props.getProperty('DRIVE_FOLDER_ID');
      if (!folderId) throw new Error('NOT_CONFIGURED');
      const folder = DriveApp.getFolderById(folderId);
      if (folder.isTrashed()) throw new Error('NOT_CONFIGURED');
      let result;
      if (payload.action === 'health') {
        result = {ready: true, protocol: 1, maxBytes: DRIVE_BRIDGE_MAX_BYTES};
      } else if (payload.action === 'upload') {
        result = bridgeUpload_(folder, payload);
      } else if (payload.action === 'read') {
        result = bridgeRead_(folderId, payload);
      } else {
        throw new Error('INVALID_ACTION');
      }
      return bridgeReply_({ok: true, data: result}, secret, requestNonce);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    const known = ['NOT_CONFIGURED', 'INVALID_REQUEST', 'UNAUTHORIZED', 'BUSY', 'REPLAY',
      'INVALID_ACTION', 'INVALID_IMAGE', 'TOO_LARGE', 'HASH_MISMATCH', 'FILE_NOT_AVAILABLE', 'UPLOAD_CONFLICT'];
    const message = err && err.message;
    const code = known.indexOf(message) >= 0 ? message : 'DRIVE_ERROR';
    // Do not log request bodies, signatures, secrets, photo data or Google errors.
    if (authenticated) return bridgeReply_({ok: false, error: code}, secret, requestNonce);
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: 'UNAUTHORIZED'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function bridgeUpload_(folder, p) {
  if (typeof p.evidenceId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.evidenceId) ||
      typeof p.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256) ||
      typeof p.base64 !== 'string' || !p.base64.length || p.base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64)) throw new Error('INVALID_REQUEST');
  if (p.base64.length > Math.ceil(DRIVE_BRIDGE_MAX_BYTES / 3) * 4) throw new Error('TOO_LARGE');
  const bytes = Utilities.base64Decode(p.base64);
  bridgeValidateImage_(bytes, p.mimeType);
  if (bridgeDigest_(bytes) !== p.sha256) throw new Error('HASH_MISMATCH');
  const extensions = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};
  const name = 'evidence_' + p.evidenceId.toLowerCase() + '_' + p.sha256 + '.' + extensions[p.mimeType];
  // Stable evidence ID + digest makes retries idempotent. Script lock serializes creation.
  const matches = folder.getFilesByName(name);
  let file;
  while (matches.hasNext()) {
    const candidate = matches.next();
    if (!candidate.isTrashed()) {
      if (candidate.getSize() !== bytes.length || candidate.getMimeType() !== p.mimeType ||
          bridgeDigest_(candidate.getBlob().getBytes()) !== p.sha256) throw new Error('UPLOAD_CONFLICT');
      file = candidate;
      break;
    }
  }
  if (!file) file = folder.createFile(Utilities.newBlob(bytes, p.mimeType, name));
  // Never call setSharing or return a public URL. Parent folder permissions are inherited.
  return {fileId: file.getId(), byteSize: bytes.length, mimeType: p.mimeType, sha256: p.sha256};
}

function bridgeRead_(folderId, p) {
  if (typeof p.fileId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(p.fileId) ||
      typeof p.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256)) throw new Error('INVALID_REQUEST');
  let file;
  try { file = DriveApp.getFileById(p.fileId); } catch (_) { throw new Error('FILE_NOT_AVAILABLE'); }
  if (file.isTrashed()) throw new Error('FILE_NOT_AVAILABLE');
  const parents = file.getParents();
  let inFolder = false;
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error('FILE_NOT_AVAILABLE');
  if (file.getSize() > DRIVE_BRIDGE_MAX_BYTES) throw new Error('TOO_LARGE');
  const bytes = file.getBlob().getBytes();
  bridgeValidateImage_(bytes, file.getMimeType());
  if (bridgeDigest_(bytes) !== p.sha256) throw new Error('HASH_MISMATCH');
  return {base64: Utilities.base64Encode(bytes), mimeType: file.getMimeType(), byteSize: bytes.length, sha256: p.sha256};
}

function bridgeValidateImage_(bytes, mime) {
  if (!bytes.length || bytes.length > DRIVE_BRIDGE_MAX_BYTES) throw new Error('TOO_LARGE');
  const b = bytes.map(function(v) { return (v + 256) % 256; });
  const jpeg = b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length-2] === 255 && b[b.length-1] === 217;
  const png = b.length >= 24 && [137,80,78,71,13,10,26,10].every(function(v,i) { return b[i] === v; });
  const webp = b.length >= 16 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80;
  if (!((mime === 'image/jpeg' && jpeg) || (mime === 'image/png' && png) || (mime === 'image/webp' && webp))) throw new Error('INVALID_IMAGE');
}

function bridgeDigest_(bytes) {
  return bridgeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
}
function bridgeHmac_(text, secret) {
  return bridgeHex_(Utilities.computeHmacSha256Signature(text, secret, Utilities.Charset.UTF_8));
}
function bridgeHex_(bytes) {
  return bytes.map(function(v) { return ((v + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
function bridgeEqual_(a, b) {
  if (typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function bridgeReply_(result, secret, nonce) {
  const payload = JSON.stringify(result);
  return ContentService.createTextOutput(JSON.stringify({v: 1, nonce: nonce, payload: payload,
    signature: bridgeHmac_('v1-response\n' + nonce + '\n' + payload, secret)}))
    .setMimeType(ContentService.MimeType.JSON);
}
