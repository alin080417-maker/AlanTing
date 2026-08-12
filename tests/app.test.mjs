import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  shouldDiscardSavedFolder,
  parseJsonBody,
  createMediaUrl,
  readFolderSettings,
  writeFolderSettings,
  clearFolderSettings,
  parseUploadResult,
  buildDriveListUrl,
  mergeDrivePage,
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

test('a saved folder is discarded when a new login cannot access it', () => {
  assert.equal(shouldDiscardSavedFolder(401), true);
  assert.equal(shouldDiscardSavedFolder(403), true);
  assert.equal(shouldDiscardSavedFolder(404), true);
  assert.equal(shouldDiscardSavedFolder(503), false);
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

test('index shell exposes shared album controls and module wiring', async () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const html = await readFile(join(testDir, '..', 'index.html'), 'utf8');
  for (const id of [
    'loginScreen', 'btnSignIn', 'loginMessage', 'app', 'sidebar', 'albumsList',
    'btnNewAlbum', 'btnChooseFolder', 'btnResetFolder', 'folderSetup',
    'folderSetupMessage', 'folderName', 'topbarTitle', 'topbarSub', 'btnUpload',
    'fileInput', 'mediaGrid', 'statsRow', 'progressBar', 'progressFill',
    'progressLabel', 'captionOverlay', 'captionPreview', 'captionInput',
    'dateInput', 'noteInput', 'captionSkip', 'captionSave', 'newAlbumOverlay',
    'albumNameInput', 'albumCancel', 'albumCreate', 'lightbox', 'lbMedia',
    'lbVideo', 'lbCaption', 'lbMeta', 'lbClose', 'lbPrev', 'lbNext', 'toast',
    'hamburger',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /<script[^>]+type=["']module["'][^>]+src=["']app\.js["']/);
  assert.doesNotMatch(html, new RegExp(['YOUR', 'GOOGLE_CLIENT_ID'].join('_')));
});

test('Drive list URL opts into shared-drive items and pagination merges pages', () => {
  const url = new URL(buildDriveListUrl("folder/1'", 'q=trashed%3Dfalse'));
  assert.equal(url.searchParams.get('includeItemsFromAllDrives'), 'true');
  assert.equal(url.searchParams.get('supportsAllDrives'), 'true');
  assert.equal(url.searchParams.get('pageSize'), '1000');
  assert.deepEqual(mergeDrivePage({ files: [{ id: 'a' }], nextPageToken: 'next' }, [{ id: 'old' }]), {
    files: [{ id: 'old' }, { id: 'a' }],
    nextPageToken: 'next',
  });
});

test('browser source avoids unsafe HTML injection and permanent deletion', async () => {
  const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'app.js'), 'utf8');
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /files\.delete/);
});

test('drive-only OAuth sign-in does not call an unrequested userinfo scope', async () => {
  const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'app.js'), 'utf8');
  assert.doesNotMatch(source, /oauth2\/v2\/userinfo/);
});

test('README documents the shared deployment contract', async () => {
  const readme = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'README.md'), 'utf8');
  for (const phrase of [
    'https://alin080417-maker.github.io/AlanTing/',
    'https://alin080417-maker.github.io',
    'Google Picker API',
    'Google Drive API',
    'HTTP referrer',
    'GOOGLE_CLOUD_PROJECT_NUMBER',
    '分享',
    '第一次',
    'Client Secret',
    'npm test',
  ]) {
    assert.match(readme, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `README missing: ${phrase}`);
  }
});
