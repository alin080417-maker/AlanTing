export const APP_MIME = 'application/vnd.google-apps.folder';
export const CONFIG_STORAGE_KEY = 'alanting.shared-folder.v1';

const stringValue = value => typeof value === 'string' ? value : '';

export function buildMeta(caption = '', date = '', note = '') {
  return JSON.stringify({
    caption: stringValue(caption),
    date: stringValue(date),
    note: stringValue(note),
  });
}

export function parseMeta(raw) {
  const fallback = { caption: stringValue(raw), date: '', note: '' };
  if (typeof raw !== 'string') return fallback;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    if (typeof value.caption !== 'string' || typeof value.date !== 'string' || typeof value.note !== 'string') {
      return fallback;
    }
    return { caption: value.caption, date: value.date, note: value.note };
  } catch {
    return fallback;
  }
}

export function formatDate(value) {
  const match = /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/.exec(stringValue(value));
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : stringValue(value);
}

export function stripExtension(filename) {
  return stringValue(filename).replace(/\.[^./\\]+$/, '').replace(/[_-]+/g, ' ').trim();
}

export function escapeDriveQueryValue(value) {
  return stringValue(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function parentPredicate(folderId) {
  return `'${escapeDriveQueryValue(folderId)}' in parents`;
}

export function buildFolderQuery(folderId) {
  return `${parentPredicate(folderId)} and mimeType = '${APP_MIME}' and trashed = false`;
}

export function buildMediaQuery(folderId) {
  return `${parentPredicate(folderId)} and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;
}

export function isSupportedMediaFile(file) {
  const mime = typeof file === 'string' ? file : stringValue(file?.mimeType || file?.type);
  return mime.startsWith('image/') || mime.startsWith('video/');
}

export function classifyDriveError(errorOrStatus) {
  const status = typeof errorOrStatus === 'number' ? errorOrStatus : Number(errorOrStatus?.status);
  if (status === 204) return 'no-content';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status >= 500 && status <= 599) return 'server-error';
  return 'client-error';
}

export function parseJsonBody(body) {
  if (body === null || body === undefined || body === '') return null;
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function createMediaUrl(fileId, accessToken) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(stringValue(fileId))}?alt=media&access_token=${encodeURIComponent(stringValue(accessToken))}`;
}

export function readFolderSettings(storage) {
  try {
    const raw = storage?.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.folderId !== 'string' || !value.folderId.trim()) return null;
    return {
      folderId: value.folderId,
      name: stringValue(value.name),
      selectedAt: value.selectedAt,
    };
  } catch {
    return null;
  }
}

export function writeFolderSettings(storage, settings) {
  if (!storage || typeof settings?.folderId !== 'string' || !settings.folderId.trim()) return false;
  try {
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({
      folderId: settings.folderId,
      name: stringValue(settings.name),
      selectedAt: settings.selectedAt ?? Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearFolderSettings(storage) {
  try {
    storage?.removeItem(CONFIG_STORAGE_KEY);
  } catch {
    // Storage can be unavailable or read-only; clearing is best effort.
  }
}

export function parseUploadResult(statusOrResponse, body = '') {
  const status = typeof statusOrResponse === 'number' ? statusOrResponse : Number(statusOrResponse?.status);
  const responseBody = typeof statusOrResponse === 'number' ? body : (statusOrResponse?.body ?? body);
  if (status < 200 || status >= 300) {
    throw new Error(`Upload failed (${status || 'unknown'})`);
  }
  return parseJsonBody(responseBody);
}

if (typeof window !== 'undefined') {
  // Browser initialization is intentionally deferred to later implementation tasks.
}
