export const APP_MIME = 'application/vnd.google-apps.folder';
export const CONFIG_STORAGE_KEY = 'alanting.shared-folder.v1';

const CLIENT_ID = '147121891766-afmbrh8ms0p7crn5m901sdu9m650e3r9.apps.googleusercontent.com';
const PICKER_API_KEY = '';
const GOOGLE_CLOUD_PROJECT_NUMBER = '';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

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
  return match ? match[1] + '年' + Number(match[2]) + '月' + Number(match[3]) + '日' : stringValue(value);
}

export function stripExtension(filename) {
  return stringValue(filename).replace(/\.[^./\\]+$/, '').replace(/[_-]+/g, ' ').trim();
}

export function escapeDriveQueryValue(value) {
  return stringValue(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function parentPredicate(folderId) {
  return "'" + escapeDriveQueryValue(folderId) + "' in parents";
}

export function buildFolderQuery(folderId) {
  return parentPredicate(folderId) + " and mimeType = '" + APP_MIME + "' and trashed = false";
}

export function buildMediaQuery(folderId) {
  return parentPredicate(folderId) + " and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false";
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
  return DRIVE_FILES_URL + '/' + encodeURIComponent(stringValue(fileId)) +
    '?alt=media&access_token=' + encodeURIComponent(stringValue(accessToken));
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
    throw new Error('Upload failed (' + (status || 'unknown') + ')');
  }
  return parseJsonBody(responseBody);
}

export function buildDriveListUrl(folderId = '', query = '', pageToken = '') {
  const params = new URLSearchParams();
  if (query) {
    const supplied = new URLSearchParams(query);
    for (const [key, value] of supplied.entries()) params.set(key, value);
  } else if (folderId) {
    params.set('q', buildMediaQuery(folderId));
  }
  params.set('pageSize', '1000');
  params.set('includeItemsFromAllDrives', 'true');
  params.set('supportsAllDrives', 'true');
  params.set('fields', 'nextPageToken,files(id,name,mimeType,thumbnailLink,description,createdTime,webContentLink)');
  if (pageToken) params.set('pageToken', pageToken);
  return DRIVE_FILES_URL + '?' + params.toString();
}

export function mergeDrivePage(page, files = []) {
  return {
    files: files.concat(Array.isArray(page?.files) ? page.files : []),
    nextPageToken: stringValue(page?.nextPageToken) || null,
  };
}

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

if (isBrowser) {
  const state = {
    accessToken: '',
    tokenClient: null,
    selectedFolder: null,
    albums: [],
    currentAlbumId: null,
    mediaItems: [],
    lightboxIndex: 0,
    uploadQueue: [],
    uploadIndex: 0,
    uploadFolderId: null,
    uploadBusy: false,
    previewUrl: '',
    toastTimer: null,
    pickerLoading: null,
    initialized: false,
  };

  const $ = id => document.getElementById(id);

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = stringValue(value);
  }

  function setHidden(id, hidden) {
    const element = $(id);
    if (element) element.hidden = Boolean(hidden);
  }

  function clearChildren(element) {
    while (element?.firstChild) element.removeChild(element.firstChild);
  }

  function showToast(message) {
    const element = $('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => element.classList.remove('show'), 3200);
  }

  function showLogin(message = '') {
    setHidden('loginScreen', false);
    setHidden('app', true);
    if (message) setText('loginMessage', message);
  }

  function showApp() {
    setHidden('loginScreen', true);
    setHidden('app', false);
  }

  function showOverlay(id, open) {
    setHidden(id, !open);
  }

  function showFolderSetup(message = '') {
    setHidden('folderSetup', false);
    if (message) setText('folderSetupMessage', message);
    setText('folderName', state.selectedFolder?.name || '尚未選擇');
    setHidden('mediaGrid', false);
    clearChildren($('mediaGrid'));
    const card = document.createElement('div');
    card.className = 'state-card';
    const icon = document.createElement('div');
    icon.className = 'setup-icon';
    icon.textContent = '🗂️';
    const copy = document.createElement('p');
    copy.textContent = message || '請先選擇你們的共用 Google Drive 資料夾。';
    card.append(icon, copy);
    $('mediaGrid').append(card);
    $('statsRow').replaceChildren();
    $('btnUpload').disabled = true;
  }

  function hideFolderSetup() {
    setHidden('folderSetup', true);
    $('btnUpload').disabled = false;
  }

  function showLoading(message = '載入中⋯') {
    clearChildren($('mediaGrid'));
    const card = document.createElement('div');
    card.className = 'state-card';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.textContent = message;
    card.append(spinner, copy);
    $('mediaGrid').append(card);
  }

  function showError(message) {
    clearChildren($('mediaGrid'));
    const card = document.createElement('div');
    card.className = 'error-state';
    const icon = document.createElement('div');
    icon.className = 'setup-icon';
    icon.textContent = '😢';
    const copy = document.createElement('p');
    copy.textContent = message;
    card.append(icon, copy);
    $('mediaGrid').append(card);
  }

  function errorMessage(error) {
    const kind = classifyDriveError(error);
    if (kind === 'unauthorized') return '登入狀態已過期，請重新登入 Google。';
    if (kind === 'forbidden') return '目前帳號沒有這個共用資料夾的權限。請確認資料夾已分享給這個 Google 帳號。';
    if (kind === 'not-found') return '找不到這個資料夾，請重新選擇共用資料夾。';
    if (kind === 'server-error') return 'Google Drive 暫時沒有回應，請稍後再試。';
    return error?.message || 'Google Drive 操作失敗，請稍後再試。';
  }

  async function gFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (state.accessToken) headers.set('Authorization', 'Bearer ' + state.accessToken);
    const response = await fetch(url, { ...options, headers });
    const raw = await response.text();
    const body = parseJsonBody(raw);
    if (!response.ok) {
      const error = new Error(body?.error?.message || 'Google Drive request failed');
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  async function listDriveFiles(query) {
    let token = '';
    let files = [];
    do {
      const queryString = new URLSearchParams({ q: query }).toString();
      const page = await gFetch(buildDriveListUrl('', queryString, token));
      const merged = mergeDrivePage(page, files);
      files = merged.files;
      token = merged.nextPageToken || '';
    } while (token);
    return files;
  }

  async function fetchFolder(folderId) {
    return gFetch(DRIVE_FILES_URL + '/' + encodeURIComponent(folderId) +
      '?fields=id,name,mimeType,trashed&supportsAllDrives=true');
  }

  async function listAlbums() {
    state.albums = await listDriveFiles(buildFolderQuery(state.selectedFolder.folderId));
    state.albums.sort((a, b) => stringValue(a.name).localeCompare(stringValue(b.name), 'zh-Hant'));
    renderSidebar();
  }

  async function listMedia(folderId) {
    return listDriveFiles(buildMediaQuery(folderId));
  }

  async function listAllMedia() {
    const folders = [state.selectedFolder.folderId].concat(state.albums.map(album => album.id));
    const batches = await Promise.all(folders.map(folderId => listMedia(folderId)));
    const seen = new Set();
    const media = [];
    for (const batch of batches.flat()) {
      if (!seen.has(batch.id)) {
        seen.add(batch.id);
        media.push(batch);
      }
    }
    media.sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));
    return media;
  }

  function renderSidebar() {
    const list = $('albumsList');
    clearChildren(list);
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'album-item' + (state.currentAlbumId === null ? ' active' : '');
    const icon = document.createElement('span');
    icon.textContent = '🏠';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = '所有回憶';
    all.append(icon, name);
    all.addEventListener('click', () => selectAlbum(null, '所有回憶'));
    list.append(all);

    for (const album of state.albums) {
      const row = document.createElement('div');
      row.className = 'album-item' + (state.currentAlbumId === album.id ? ' active' : '');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      const albumIcon = document.createElement('span');
      albumIcon.textContent = '🌸';
      const albumName = document.createElement('span');
      albumName.className = 'name';
      albumName.textContent = album.name || '未命名相簿';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'album-delete';
      remove.setAttribute('aria-label', '刪除相簿 ' + (album.name || '未命名相簿'));
      remove.textContent = '✕';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        deleteAlbum(album);
      });
      row.append(albumIcon, albumName, remove);
      row.addEventListener('click', () => selectAlbum(album.id, album.name));
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectAlbum(album.id, album.name);
        }
      });
      list.append(row);
    }
  }

  function renderStats(mediaItems) {
    const photos = mediaItems.filter(item => stringValue(item.mimeType).startsWith('image/')).length;
    const videos = mediaItems.filter(item => stringValue(item.mimeType).startsWith('video/')).length;
    const stats = [
      [photos, '張照片'],
      [videos, '部影片'],
      [state.albums.length, '個相簿'],
    ];
    const container = $('statsRow');
    clearChildren(container);
    for (const [value, label] of stats) {
      const chip = document.createElement('div');
      chip.className = 'stat-chip';
      const strong = document.createElement('strong');
      strong.textContent = String(value);
      chip.append(strong, document.createTextNode(label));
      container.append(chip);
    }
  }

  function makePlaceholder(item) {
    const placeholder = document.createElement('div');
    placeholder.className = 'media-card-thumb';
    placeholder.textContent = stringValue(item.mimeType).startsWith('video/') ? '▶' : '🌸';
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  }

  function createMediaCard(item, index) {
    const card = document.createElement('article');
    card.className = 'media-card';
    card.style.animationDelay = (index * 0.03) + 's';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'media-card-open';
    open.style.cssText = 'display:block;width:100%;padding:0;background:transparent;border:0;text-align:left;color:inherit;';
    open.addEventListener('click', () => openLightbox(index));

    if (item.thumbnailLink) {
      const thumbnail = document.createElement('img');
      thumbnail.className = 'media-card-image';
      thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      thumbnail.src = item.thumbnailLink;
      thumbnail.alt = parseMeta(item.description || '').caption || item.name || '相簿媒體';
      thumbnail.addEventListener('error', () => {
        thumbnail.replaceWith(makePlaceholder(item));
      }, { once: true });
      open.append(thumbnail);
    } else {
      open.append(makePlaceholder(item));
    }

    const meta = parseMeta(item.description || '');
    const body = document.createElement('div');
    body.className = 'media-card-body';
    const caption = document.createElement('div');
    caption.className = 'media-card-caption';
    caption.textContent = meta.caption || item.name || '未命名檔案';
    const date = document.createElement('div');
    date.className = 'media-card-meta';
    date.textContent = meta.date ? '📅 ' + formatDate(meta.date) : '';
    body.append(caption, date);
    open.append(body);

    const actions = document.createElement('div');
    actions.className = 'media-card-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'card-action';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', '刪除 ' + (item.name || '檔案'));
    remove.addEventListener('click', event => {
      event.stopPropagation();
      deleteFile(item);
    });
    actions.append(remove);

    card.append(open, actions);
    return card;
  }

  function renderMedia() {
    const grid = $('mediaGrid');
    clearChildren(grid);
    if (!state.mediaItems.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const icon = document.createElement('div');
      icon.className = 'setup-icon';
      icon.textContent = '💌';
      const copy = document.createElement('p');
      copy.textContent = '這裡還沒有回憶，點擊右上角「🌸 上傳」加入第一個檔案吧。';
      empty.append(icon, copy);
      grid.append(empty);
      return;
    }
    state.mediaItems.forEach((item, index) => grid.append(createMediaCard(item, index)));
  }

  async function renderView() {
    if (!state.selectedFolder) {
      showFolderSetup();
      return;
    }
    hideFolderSetup();
    showLoading();
    try {
      state.mediaItems = state.currentAlbumId ? await listMedia(state.currentAlbumId) : await listAllMedia();
      renderStats(state.mediaItems);
      setText('topbarSub', state.mediaItems.length ? '共 ' + state.mediaItems.length + ' 個檔案' : '');
      renderMedia();
    } catch (error) {
      if (classifyDriveError(error) === 'unauthorized') {
        state.accessToken = '';
        showLogin(errorMessage(error));
        return;
      }
      if (classifyDriveError(error) === 'forbidden' || classifyDriveError(error) === 'not-found') {
        clearFolderSettings(window.localStorage);
        state.selectedFolder = null;
        showFolderSetup(errorMessage(error));
        return;
      }
      showError(errorMessage(error));
    }
  }

  async function selectAlbum(id, name) {
    state.currentAlbumId = id;
    setText('topbarTitle', name || '所有回憶');
    renderSidebar();
    $('sidebar').classList.remove('open');
    $('hamburger').setAttribute('aria-expanded', 'false');
    await renderView();
  }

  async function loadSelectedFolder(folderId, name = '') {
    const folder = await fetchFolder(folderId);
    if (folder?.mimeType !== APP_MIME || folder?.trashed) {
      const error = new Error('選取的項目不是可用的資料夾');
      error.status = 404;
      throw error;
    }
    state.selectedFolder = { folderId: folder.id, name: folder.name || name || '共用相簿' };
    state.currentAlbumId = null;
    writeFolderSettings(window.localStorage, {
      folderId: state.selectedFolder.folderId,
      name: state.selectedFolder.name,
      selectedAt: Date.now(),
    });
    setText('folderName', state.selectedFolder.name);
    await listAlbums();
    await renderView();
  }

  async function chooseFolder() {
    if (!state.accessToken) {
      showToast('請先登入 Google。');
      return;
    }
    if (!PICKER_API_KEY || !GOOGLE_CLOUD_PROJECT_NUMBER) {
      showFolderSetup('請先在 app.js 填入 Google Picker API key 與 Cloud project number，再重新整理頁面。');
      return;
    }
    try {
      await loadPicker();
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(true);
      if (view.setMimeTypes) view.setMimeTypes(APP_MIME);
      let builder = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(state.accessToken)
        .setDeveloperKey(PICKER_API_KEY)
        .setAppId(GOOGLE_CLOUD_PROJECT_NUMBER)
        .setLocale('zh-TW')
        .setTitle('選擇你們的共用資料夾')
        .setCallback(async data => {
          const pickedAction = window.google.picker.Action.PICKED;
          if (data[window.google.picker.Response.ACTION] !== pickedAction) return;
          const doc = data[window.google.picker.Response.DOCUMENTS]?.[0];
          const type = doc?.[window.google.picker.Document.TYPE];
          if (type && type !== window.google.picker.Type.FOLDER) {
            showToast('請選擇資料夾，不是檔案。');
            return;
          }
          const folderId = doc?.[window.google.picker.Document.ID];
          if (!folderId) {
            showToast('沒有取得資料夾，請重新選擇。');
            return;
          }
          try {
            await loadSelectedFolder(folderId, doc[window.google.picker.Document.NAME]);
            showToast('共用資料夾已設定。');
          } catch (error) {
            showFolderSetup(errorMessage(error));
          }
        });
      if (window.google.picker.Feature?.SUPPORT_DRIVES && builder.enableFeature) {
        builder = builder.enableFeature(window.google.picker.Feature.SUPPORT_DRIVES);
      }
      builder.build().setVisible(true);
    } catch (error) {
      showFolderSetup(error.message || 'Google Picker 載入失敗，請稍後再試。');
    }
  }

  async function loadPicker() {
    if (window.google?.picker) return;
    if (state.pickerLoading) return state.pickerLoading;
    state.pickerLoading = new Promise((resolve, reject) => {
      const deadline = Date.now() + 10000;
      const waitForApi = () => {
        if (window.gapi?.load) {
          window.gapi.load('picker', () => resolve());
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('Google Picker API 尚未載入，請重新整理頁面。'));
          return;
        }
        window.setTimeout(waitForApi, 100);
      };
      waitForApi();
    }).finally(() => {
      state.pickerLoading = null;
    });
    return state.pickerLoading;
  }

  function requestAccessToken(prompt = '') {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error('Google 登入服務尚未載入，請重新整理頁面。'));
        return;
      }
      state.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: response => {
          if (response.error) {
            reject(new Error('Google 登入未完成。'));
            return;
          }
          state.accessToken = response.access_token;
          resolve(response.access_token);
        },
      });
      state.tokenClient.requestAccessToken({ prompt });
    });
  }

  async function signIn() {
    setText('loginMessage', '正在連線到 Google⋯');
    try {
      await requestAccessToken('consent');
      const user = await gFetch('https://www.googleapis.com/oauth2/v2/userinfo');
      setText('userName', user.name || user.email || '已登入');
      const avatar = $('userAvatar');
      if (avatar) {
        avatar.src = user.picture || '';
        avatar.alt = user.name || '目前使用者';
      }
      showApp();
      const stored = readFolderSettings(window.localStorage);
      if (stored) {
        try {
          await loadSelectedFolder(stored.folderId, stored.name);
          return;
        } catch (error) {
          if (classifyDriveError(error) === 'unauthorized') throw error;
          clearFolderSettings(window.localStorage);
          state.selectedFolder = null;
        }
      }
      showFolderSetup('請選取你和女友共同分享的 Google Drive 資料夾。');
    } catch (error) {
      state.accessToken = '';
      showLogin(errorMessage(error));
    }
  }

  function signOut() {
    const token = state.accessToken;
    state.accessToken = '';
    state.selectedFolder = null;
    state.albums = [];
    state.mediaItems = [];
    if (token && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(token, () => showLogin('已登出 Google。'));
    } else {
      showLogin('已登出 Google。');
    }
  }

  function updateUploadControls(disabled) {
    $('captionSave').disabled = disabled;
    $('captionSkip').disabled = disabled;
  }

  function releasePreview() {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = '';
    }
    const preview = $('captionPreview');
    if (preview) {
      preview.src = '';
      preview.hidden = true;
    }
  }

  function showCaptionModal(file) {
    releasePreview();
    if (file.type.startsWith('image/')) {
      state.previewUrl = URL.createObjectURL(file);
      $('captionPreview').src = state.previewUrl;
      $('captionPreview').hidden = false;
    }
    $('captionInput').value = stripExtension(file.name);
    $('dateInput').value = new Date().toISOString().slice(0, 10);
    $('noteInput').value = '';
    updateUploadControls(false);
    showOverlay('captionOverlay', true);
    $('captionInput').focus();
  }

  function startUploadQueue(files) {
    if (!state.selectedFolder) {
      showFolderSetup('請先選擇共用資料夾，再開始上傳。');
      return;
    }
    const supported = files.filter(isSupportedMediaFile);
    if (!supported.length) {
      showToast('只支援照片與影片檔案。');
      return;
    }
    state.uploadQueue = supported;
    state.uploadIndex = 0;
    state.uploadFolderId = state.currentAlbumId || state.selectedFolder.folderId;
    showCaptionModal(state.uploadQueue[0]);
  }

  function uploadFile(file, folderId, description, index, total) {
    return new Promise((resolve, reject) => {
      const metadata = {
        name: file.name,
        parents: [folderId],
        description,
      };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,thumbnailLink,description,createdTime');
      xhr.setRequestHeader('Authorization', 'Bearer ' + state.accessToken);
      xhr.upload.addEventListener('progress', event => {
        if (!event.lengthComputable) return;
        setHidden('progressBar', false);
        $('progressFill').style.width = Math.round((event.loaded / event.total) * 100) + '%';
        setText('progressLabel', (index + 1) + ' / ' + total);
      });
      xhr.addEventListener('load', () => {
        try {
          const result = parseUploadResult(xhr.status, xhr.responseText);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      xhr.addEventListener('error', () => reject(new Error('網路中斷，檔案尚未上傳完成。')));
      xhr.send(form);
    });
  }

  async function processCaption(skip) {
    if (state.uploadBusy) return;
    state.uploadBusy = true;
    updateUploadControls(true);
    const file = state.uploadQueue[state.uploadIndex];
    const caption = skip ? '' : $('captionInput').value.trim();
    const date = skip ? '' : $('dateInput').value;
    const note = skip ? '' : $('noteInput').value.trim();
    showOverlay('captionOverlay', false);
    setHidden('progressBar', false);
    try {
      await uploadFile(file, state.uploadFolderId, buildMeta(caption, date, note),
        state.uploadIndex, state.uploadQueue.length);
      state.uploadIndex += 1;
      if (state.uploadIndex < state.uploadQueue.length) {
        state.uploadBusy = false;
        releasePreview();
        showCaptionModal(state.uploadQueue[state.uploadIndex]);
        return;
      }
      setHidden('progressBar', true);
      $('progressFill').style.width = '0%';
      showToast('成功上傳 ' + state.uploadQueue.length + ' 個檔案！');
      state.uploadQueue = [];
      state.uploadBusy = false;
      releasePreview();
      await renderView();
    } catch (error) {
      setHidden('progressBar', true);
      state.uploadBusy = false;
      releasePreview();
      showToast(errorMessage(error));
    }
  }

  async function createAlbum() {
    const name = $('albumNameInput').value.trim();
    if (!name || !state.selectedFolder) return;
    $('albumCreate').disabled = true;
    try {
      await gFetch(DRIVE_FILES_URL + '?supportsAllDrives=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: APP_MIME, parents: [state.selectedFolder.folderId] }),
      });
      showOverlay('newAlbumOverlay', false);
      $('albumNameInput').value = '';
      await listAlbums();
      showToast('相簿「' + name + '」已建立。');
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      $('albumCreate').disabled = false;
    }
  }

  async function trashDriveItem(id) {
    return gFetch(DRIVE_FILES_URL + '/' + encodeURIComponent(id) + '?supportsAllDrives=true', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }

  async function deleteFile(item) {
    const name = item.name || '這個檔案';
    if (!window.confirm('確定要刪除「' + name + '」嗎？檔案會移到 Google Drive 垃圾桶。')) return;
    try {
      await trashDriveItem(item.id);
      showToast('已移到垃圾桶。');
      await renderView();
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function deleteAlbum(album) {
    const name = album.name || '這個相簿';
    if (!window.confirm('確定要刪除相簿「' + name + '」嗎？相簿會移到 Google Drive 垃圾桶。')) return;
    try {
      await trashDriveItem(album.id);
      if (state.currentAlbumId === album.id) state.currentAlbumId = null;
      await listAlbums();
      await renderView();
      showToast('相簿已移到垃圾桶。');
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function updateLightbox() {
    const item = state.mediaItems[state.lightboxIndex];
    if (!item) return;
    const meta = parseMeta(item.description || '');
    const image = $('lbMedia');
    const video = $('lbVideo');
    const loading = $('lbLoading');
    const error = $('lbError');
    setHidden('lbLoading', false);
    setHidden('lbError', true);
    setHidden('lbMedia', true);
    setHidden('lbVideo', true);
    setText('lbCaption', meta.caption || item.name || '未命名檔案');
    const parts = [];
    if (meta.date) parts.push(formatDate(meta.date));
    if (meta.note) parts.push(meta.note);
    setText('lbMeta', parts.join(' · '));
    const src = createMediaUrl(item.id, state.accessToken);
    if (stringValue(item.mimeType).startsWith('video/')) {
      video.src = src;
      video.onloadeddata = () => setHidden('lbLoading', true);
      video.onerror = () => {
        setHidden('lbLoading', true);
        setHidden('lbError', false);
      };
      video.hidden = false;
    } else {
      image.src = src;
      image.alt = meta.caption || item.name || '相簿照片';
      image.onload = () => setHidden('lbLoading', true);
      image.onerror = () => {
        setHidden('lbLoading', true);
        setHidden('lbError', false);
      };
      image.hidden = false;
    }
  }

  function openLightbox(index) {
    state.lightboxIndex = index;
    showOverlay('lightbox', true);
    updateLightbox();
  }

  function closeLightbox() {
    showOverlay('lightbox', false);
    const image = $('lbMedia');
    const video = $('lbVideo');
    image.src = '';
    video.pause();
    video.removeAttribute('src');
    video.load();
    setHidden('lbLoading', true);
    setHidden('lbError', true);
  }

  function moveLightbox(step) {
    if (!state.mediaItems.length) return;
    state.lightboxIndex = (state.lightboxIndex + step + state.mediaItems.length) % state.mediaItems.length;
    updateLightbox();
  }

  function bindEvents() {
    $('btnSignIn').addEventListener('click', signIn);
    $('btnSignOut').addEventListener('click', signOut);
    $('btnChooseFolder').addEventListener('click', chooseFolder);
    $('btnResetFolder').addEventListener('click', () => {
      clearFolderSettings(window.localStorage);
      state.selectedFolder = null;
      showFolderSetup('請重新選取你們的共用 Google Drive 資料夾。');
    });
    $('folderSetupChoose').addEventListener('click', chooseFolder);
    $('btnUpload').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', event => {
      startUploadQueue(Array.from(event.target.files || []));
      event.target.value = '';
    });
    $('captionSave').addEventListener('click', () => processCaption(false));
    $('captionSkip').addEventListener('click', () => processCaption(true));
    $('btnNewAlbum').addEventListener('click', () => {
      $('albumNameInput').value = '';
      showOverlay('newAlbumOverlay', true);
      $('albumNameInput').focus();
    });
    $('albumCancel').addEventListener('click', () => showOverlay('newAlbumOverlay', false));
    $('albumCreate').addEventListener('click', createAlbum);
    $('albumNameInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') createAlbum();
    });
    $('lbClose').addEventListener('click', closeLightbox);
    $('lbPrev').addEventListener('click', () => moveLightbox(-1));
    $('lbNext').addEventListener('click', () => moveLightbox(1));
    $('lightbox').addEventListener('click', event => {
      if (event.target === $('lightbox')) closeLightbox();
    });
    $('hamburger').addEventListener('click', () => {
      const open = !$('sidebar').classList.contains('open');
      $('sidebar').classList.toggle('open', open);
      $('hamburger').setAttribute('aria-expanded', String(open));
    });
    for (const id of ['captionOverlay', 'newAlbumOverlay']) {
      $(id).addEventListener('click', event => {
        if (event.target === $(id)) showOverlay(id, false);
      });
    }
    document.addEventListener('keydown', event => {
      if ($('lightbox').hidden) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') moveLightbox(-1);
      if (event.key === 'ArrowRight') moveLightbox(1);
    });
    let dragCounter = 0;
    document.addEventListener('dragenter', event => {
      event.preventDefault();
      dragCounter += 1;
      setHidden('dropOverlay', false);
    });
    document.addEventListener('dragover', event => event.preventDefault());
    document.addEventListener('dragleave', () => {
      dragCounter -= 1;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setHidden('dropOverlay', true);
      }
    });
    document.addEventListener('drop', event => {
      event.preventDefault();
      dragCounter = 0;
      setHidden('dropOverlay', true);
      startUploadQueue(Array.from(event.dataTransfer?.files || []));
    });
  }

  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;
    bindEvents();
    showLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}

