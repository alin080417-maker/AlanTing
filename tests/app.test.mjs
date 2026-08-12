import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_MIME,
  CONFIG_STORAGE_KEY,
  buildMeta,
  parseMeta,
  formatDate,
  stripExtension,
  escapeDriveQueryValue,
  buildFolderQuery,
  buildMediaQuery,
  isSupportedMediaFile,
  classifyDriveError,
  parseJsonBody,
  createMediaUrl,
  readFolderSettings,
  writeFolderSettings,
  clearFolderSettings,
  parseUploadResult,
} from '../app.js';

test('buildMeta and parseMeta preserve caption, date, and note', () => {
  const raw = buildMeta('海邊', '2026-08-12', '夕陽');
  assert.deepEqual(parseMeta(raw), { caption: '海邊', date: '2026-08-12', note: '夕陽' });
});

test('parseMeta safely falls back for legacy plain descriptions', () => {
  assert.deepEqual(parseMeta('old caption'), { caption: 'old caption', date: '', note: '' });
});

test('formatDate and stripExtension format user-facing values', () => {
  assert.equal(formatDate('2026-08-12'), '2026年8月12日');
  assert.equal(stripExtension('first_trip-photo.MP4'), 'first trip photo');
});

test('Drive query helpers escape IDs and select direct children', () => {
  const id = "root\\folder'1";
  assert.equal(escapeDriveQueryValue(id), "root\\\\folder\\'1");
  assert.match(buildFolderQuery(id), /mimeType = 'application\/vnd\.google-apps\.folder'/);
  assert.match(buildFolderQuery(id), /'root\\\\folder\\'1' in parents/);
  assert.match(buildMediaQuery(id), /'root\\\\folder\\'1' in parents/);
  const mediaQuery = buildMediaQuery(id);
  assert.ok(mediaQuery.includes("mimeType contains 'image/'"));
  assert.ok(mediaQuery.includes("mimeType contains 'video/'"));
  assert.match(mediaQuery, /trashed = false/);
});

test('media validation accepts images and videos only', () => {
  assert.equal(APP_MIME, 'application/vnd.google-apps.folder');
  assert.equal(isSupportedMediaFile({ type: 'image/jpeg' }), true);
  assert.equal(isSupportedMediaFile({ mimeType: 'video/mp4' }), true);
  assert.equal(isSupportedMediaFile({ type: 'application/pdf' }), false);
});

test('Drive errors classify empty, auth, permission, missing, and server responses', () => {
  assert.equal(classifyDriveError(204), 'no-content');
  assert.equal(classifyDriveError(401), 'unauthorized');
  assert.equal(classifyDriveError(403), 'forbidden');
  assert.equal(classifyDriveError(404), 'not-found');
  assert.equal(classifyDriveError(503), 'server-error');
});

test('response parsing handles JSON and empty bodies', () => {
  assert.deepEqual(parseJsonBody('{"ok":true}'), { ok: true });
  assert.equal(parseJsonBody(''), null);
  assert.equal(parseJsonBody(null), null);
});

test('media URL encodes file ID and access token', () => {
  const url = createMediaUrl('id/with space', 'tok+en&value');
  assert.equal(url, 'https://www.googleapis.com/drive/v3/files/id%2Fwith%20space?alt=media&access_token=tok%2Ben%26value');
});

test('folder settings round-trip and clearing tolerate localStorage', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  assert.equal(CONFIG_STORAGE_KEY, 'alanting.shared-folder.v1');
  assert.equal(writeFolderSettings(storage, { folderId: 'folder-1', name: 'Shared', selectedAt: 1 }), true);
  assert.deepEqual(readFolderSettings(storage), { folderId: 'folder-1', name: 'Shared', selectedAt: 1 });
  clearFolderSettings(storage);
  assert.equal(readFolderSettings(storage), null);
  storage.setItem(CONFIG_STORAGE_KEY, '{bad');
  assert.equal(readFolderSettings(storage), null);
  assert.equal(writeFolderSettings(storage, { folderId: '' }), false);
});

test('upload result rejects every non-2xx response', () => {
  assert.deepEqual(parseUploadResult(201, '{"id":"file-1"}'), { id: 'file-1' });
  assert.throws(() => parseUploadResult(400, '{"error":"bad"}'), /Upload failed/);
  assert.equal(parseUploadResult(204, ''), null);
});
