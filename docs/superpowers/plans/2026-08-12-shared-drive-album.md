# Shared Drive Album Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Convert the single-file AlanTing memory album into a GitHub Pages-ready shared Google Drive album for two Google accounts.

**Architecture:** Keep the app as a static ES-module website. \`index.html\` owns semantic layout, \`styles.css\` owns responsive presentation, and \`app.js\` owns Google Identity Services, Google Picker, Drive API calls, state, safe DOM rendering, media loading, uploads, and trash operations. Pure helpers are exported from \`app.js\` so Node's built-in test runner can verify them without a browser.

**Tech Stack:** HTML, CSS, browser JavaScript ES modules, Google Identity Services, Google Picker API, Google Drive API v3, Node.js built-in \`node:test\`.

## Global Constraints

- The target deployment is \`https://alin080417-maker.github.io/AlanTing/\`, served from the \`main\` branch root with no build step.
- The shared root folder is selected with Google Picker per browser and persisted only as folder ID, name, and selection timestamp in \`localStorage\`; no account email allowlist is used.
- OAuth keeps \`https://www.googleapis.com/auth/drive.file\`; no Client Secret may appear in repository files.
- \`PICKER_API_KEY\` is a public Browser API key and \`GOOGLE_CLOUD_PROJECT_NUMBER\` is public configuration; README must require HTTP referrer and API restrictions for the key.
- The media grid may load only thumbnails. Full image/video URLs are created after a user opens a media item; video uses \`controls\`, \`playsinline\`, and no autoplay.
- Dynamic Drive values must be written with \`textContent\` or DOM properties, never interpolated into \`innerHTML\`.
- Drive API requests must handle pagination, 204 responses, 401/403/404/5xx errors, and non-2xx upload responses with user-visible Traditional Chinese messages.
- Deletion uses a reversible Google Drive trash update and requires confirmation; it must not call permanent deletion.
- Every new pure helper or bug fix follows TDD: write a failing test, run it and observe the expected failure, implement the minimum behavior, then run the focused and full test suites.

---

### Task 1: Scaffold the static module and tested pure helpers

**Files:**
- Create: \`package.json\`
- Create: \`tests/app.test.mjs\`
- Create: \`app.js\`
- Modify: \`index.html\` only later in Task 2; do not add browser-only initialization to the helper module before the tests exist.

**Interfaces:**
- Export from \`app.js\`: \`APP_MIME\`, \`CONFIG_STORAGE_KEY\`, \`buildMeta\`, \`parseMeta\`, \`formatDate\`, \`stripExtension\`, \`escapeDriveQueryValue\`, \`buildFolderQuery\`, \`buildMediaQuery\`, \`isSupportedMediaFile\`, \`classifyDriveError\`, \`parseJsonBody\`, \`createMediaUrl\`, \`readFolderSettings\`, \`writeFolderSettings\`, \`clearFolderSettings\`, and \`parseUploadResult\`.
- Helpers must work in Node without a DOM. Browser initialization must be guarded by \`typeof window !== 'undefined'\`.

- [ ] **Step 1: Add the package test command**

Create \`package.json\` with \`"type": "module"\` and the exact script \`"test": "node --test"\`; do not add runtime dependencies.

- [ ] **Step 2: Write failing tests for metadata and display helpers**

In \`tests/app.test.mjs\`, import the named helpers and cover:

\`\`\`js
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
\`\`\`

- [ ] **Step 3: Run the focused tests and verify the expected missing-helper failure**

Run \`npm test -- tests/app.test.mjs\`; it must fail because the exported helpers do not exist yet.

- [ ] **Step 4: Implement the metadata and display helpers**

Implement the exact named exports with safe string defaults. \`parseMeta\` must accept only object-shaped JSON with string fields and fall back to \`{ caption: raw, date: '', note: '' }\` for legacy or malformed input.

- [ ] **Step 5: Add failing tests for Drive queries, validation, errors, storage, and media URLs**

Cover apostrophe/backslash escaping in Drive queries, direct-child folder/media predicates, image/video MIME validation, \`204\`/\`401\`/\`403\`/\`404\`/\`5xx\` classification, JSON and empty response parsing, folder settings round-trip and clearing, URL encoding of file ID/token, and rejection of non-2xx upload responses.

- [ ] **Step 6: Run the focused tests to verify the second expected failure**

Run \`npm test -- tests/app.test.mjs\`; the new tests must fail for missing implementations rather than test syntax errors.

- [ ] **Step 7: Implement the remaining pure helpers**

Use \`APP_MIME = 'application/vnd.google-apps.folder'\`. Query builders must return Drive v3 \`q\` fragments that escape user-controlled folder IDs. \`parseJsonBody\` must return \`null\` for empty/204 bodies. \`parseUploadResult\` must throw on every status outside 200–299. Storage functions must tolerate malformed localStorage values and validate non-empty string folder IDs.

- [ ] **Step 8: Run focused and full tests, then commit Task 1**

Run \`npm test -- tests/app.test.mjs\` followed by \`npm test\`. Commit with \`test: add shared drive helper foundation\`.

### Task 2: Build the responsive static UI and safe media shell

**Files:**
- Replace: \`index.html\`
- Create: \`styles.css\`

**Interfaces:**
- \`index.html\` loads \`https://apis.google.com/js/api.js\`, \`https://accounts.google.com/gsi/client\`, and \`<script type="module" src="app.js"></script>\`.
- Element IDs consumed by \`app.js\` include \`loginScreen\`, \`btnSignIn\`, \`loginMessage\`, \`app\`, \`sidebar\`, \`albumsList\`, \`btnNewAlbum\`, \`btnChooseFolder\`, \`btnResetFolder\`, \`folderSetup\`, \`folderSetupMessage\`, \`folderName\`, \`topbarTitle\`, \`topbarSub\`, \`btnUpload\`, \`fileInput\`, \`mediaGrid\`, \`statsRow\`, \`progressBar\`, \`progressFill\`, \`progressLabel\`, \`captionOverlay\`, \`captionPreview\`, \`captionInput\`, \`dateInput\`, \`noteInput\`, \`captionSkip\`, \`captionSave\`, \`newAlbumOverlay\`, \`albumNameInput\`, \`albumCancel\`, \`albumCreate\`, \`lightbox\`, \`lbMedia\`, \`lbVideo\`, \`lbCaption\`, \`lbMeta\`, \`lbClose\`, \`lbPrev\`, \`lbNext\`, \`toast\`, and \`hamburger\`.
- No dynamic Drive value may occur inside an HTML template string. Static labels may be authored in HTML; dynamic cards are created by \`app.js\` DOM methods.

- [ ] **Step 1: Write a static smoke test that requires the planned IDs and no credential placeholder**

Add a Node test that reads \`index.html\` and asserts every required ID appears, the document contains \`type="module"\`, and the old \`YOUR_GOOGLE_CLIENT_ID\` placeholder is absent.

- [ ] **Step 2: Run the smoke test and verify it fails against the old page**

Run \`npm test -- tests/app.test.mjs\`; it must fail on the missing shared-folder IDs/module wiring.

- [ ] **Step 3: Replace \`index.html\` with accessible static markup**

Provide a login wall, shared-folder setup state, desktop sidebar, mobile hamburger, responsive toolbar, empty/error/loading regions, caption/new-album dialogs, lightbox image/video elements, and live-region toast. Keep the existing warm floral visual identity and Traditional Chinese user-facing copy. Use \`aria-live\`, \`aria-label\`, dialog buttons, \`loading="lazy"\` for thumbnail images, and \`playsinline\`/\`controls\` for the full video element.

- [ ] **Step 4: Add responsive \`styles.css\`**

Move the existing visual tokens and animation style into the stylesheet, retain a four-column desktop / two-column mobile media grid, add visible setup/error/loading states, make dialogs and full-media lightbox usable at mobile widths, and keep the progress bar above the mobile safe area.

- [ ] **Step 5: Run the smoke test and syntax check**

Run \`npm test -- tests/app.test.mjs\` and \`node --check app.js\`; the smoke assertions must pass while browser behavior remains unimplemented.

- [ ] **Step 6: Commit Task 2**

Commit with \`feat: add shared album responsive shell\`.

### Task 3: Implement Google auth, Picker, Drive operations, and media interactions

**Files:**
- Modify: \`app.js\`

**Interfaces:**
- Use the Task 1 exports; preserve their signatures.
- Use the Task 2 element IDs exactly.
- Configuration constants are \`CLIENT_ID\` with the existing OAuth Client ID, \`PICKER_API_KEY = ''\`, \`GOOGLE_CLOUD_PROJECT_NUMBER = ''\`, \`SCOPES = 'https://www.googleapis.com/auth/drive.file'\`, and \`CONFIG_STORAGE_KEY = 'alanting.shared-folder.v1'\`.

- [ ] **Step 1: Write failing tests for browser-facing request behavior through pure boundaries**

Add tests for a request URL that includes \`includeItemsFromAllDrives=true\`, \`supportsAllDrives=true\` where applicable, a pagination reducer that consumes \`nextPageToken\`, and a card-safe dynamic text path that never requires HTML interpolation. Add a static source assertion that \`app.js\` contains no \`innerHTML\` assignment and no \`files.delete\` call.

- [ ] **Step 2: Run the focused tests and observe failure**

Run \`npm test -- tests/app.test.mjs\`; the new integration-boundary assertions must fail before the implementation is added.

- [ ] **Step 3: Implement guarded browser initialization and OAuth**

Initialize controls only when \`window\` and \`document\` exist. Build a token-client promise wrapper around \`google.accounts.oauth2.initTokenClient\`. Keep the access token in memory only. Show the login wall before authorization; on 401 clear the token and return to login with an actionable message.

- [ ] **Step 4: Implement Picker loading and shared-folder selection**

Load \`gapi\`'s \`picker\` library once. Build a folder-only Picker with OAuth token, public API key, project number, locale \`zh-TW\`, included folders, folder selection enabled, shared-drive support, and a callback that accepts only a folder document. Save folder ID/name/timestamp through the tested storage helpers, then load that folder. If API key or project number is empty, show Google Cloud setup instructions instead of opening a broken Picker.

- [ ] **Step 5: Implement Drive fetch, pagination, folder/media listing, and permission recovery**

Implement a JSON-aware \`gFetch\`, classify errors, include shared-drive query parameters, list all pages, list direct child albums and root media, merge and sort media for the all-items view, and clear the selected folder only for 403/404 folder access failures. Render all remote text with DOM properties.

- [ ] **Step 6: Implement thumbnail-only cards and click-to-load full media**

Cards use only \`thumbnailLink\` or a static placeholder; video cards do not create a \`<video src>\` in the grid. On click, create the encoded access-token media URL, set only the lightbox image or video source, show loading/error state, and clear the media source plus call \`load()\` on close. Support previous/next, Escape, background close, and mobile controls.

- [ ] **Step 7: Implement upload, album creation, and reversible deletion**

Validate dropped/selected MIME types, collect caption/date/note metadata, upload with multipart XHR and progress, reject non-2xx responses, prevent duplicate submit while active, create folders under the selected shared root, and trash files/folders through \`files.update\` with \`{ trashed: true }\` plus \`supportsAllDrives=true\`. Confirm before every deletion and refresh the current view after success.

- [ ] **Step 8: Run focused and full tests, then commit Task 3**

Run \`npm test -- tests/app.test.mjs\`, \`npm test\`, and \`node --check app.js\`. Commit with \`feat: support shared drive album workflow\`.

### Task 4: Add deployment documentation and finish QA

**Files:**
- Create: \`README.md\`
- Modify: \`package.json\` only if the final test script needs correction.

- [ ] **Step 1: Write failing documentation/source checks**

Add tests asserting README contains the exact GitHub Pages URL, OAuth origin, Picker API, Drive API, API-key restriction, project-number, shared-folder invitation, first-use Picker, Client Secret warning, and \`npm test\` instructions.

- [ ] **Step 2: Run the documentation test and verify missing sections**

Run \`npm test -- tests/app.test.mjs\`; it must fail because README does not yet exist.

- [ ] **Step 3: Write complete Traditional Chinese README**

Document Google Cloud setup, OAuth authorized JavaScript origin, Drive/Picker APIs, restricted Browser API key, project number, public config placeholders, sharing the root folder with the girlfriend's Google account, first-use folder selection for both accounts, GitHub Pages deployment, mobile behavior, permissions, troubleshooting, and local verification commands. Explicitly state never to put a Client Secret in frontend files.

- [ ] **Step 4: Run the full verification suite**

Run \`npm test\`, \`node --check app.js\`, \`git diff --check\`, and a repository-wide scan for \`YOUR_GOOGLE_CLIENT_ID\`, \`innerHTML\`, \`files.delete\`, and likely Client Secret patterns. Use the results to fix any real defects before committing.

- [ ] **Step 5: Commit Task 4**

Commit with \`docs: add shared album setup and deployment guide\`.

- [ ] **Step 6: Review the branch diff and prepare the Draft PR**

Confirm only intended files changed, re-run the full checks, and prepare a Draft PR targeting \`main\` with a body covering the shared-folder architecture, security fixes, mobile media behavior, tests, and the Google Cloud values the user must fill before deployment.
