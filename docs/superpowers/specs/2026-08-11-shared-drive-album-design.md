# AlanTing 共用 Google Drive 相簿設計

## 目標

將目前的單檔私人相簿網站整理成可部署於 GitHub Pages 的共用相簿：使用者與女友各自登入 Google，透過 Google Picker 選取同一個 Google Drive 共用資料夾，之後共同查看、上傳、建立相簿與刪除媒體。

第一版保留現有的照片、影片、相簿、標題、日期、備註、拖放上傳與燈箱功能；同時修正安全性、錯誤處理、手機體驗與部署文件問題。

## 已確認的範圍

- 正式部署：GitHub Pages project site，網址為 `https://alin080417-maker.github.io/AlanTing/`。
- 資料來源：一個由 Google Drive 共享權限控制的共用資料夾。
- 授權：沿用現有 OAuth Client ID，使用 `https://www.googleapis.com/auth/drive.file`。
- Picker：加入 Google Picker API、Browser API key 與 Google Cloud project number。
- 資料夾設定：每個瀏覽器首次登入時選取資料夾，folder ID 存在 `localStorage`，並提供重新選取。
- 操作權限：兩位使用者平等協作；都能查看、上傳、建立相簿與刪除。刪除前二次確認，沿用 Google Drive 的垃圾桶行為，不做永久刪除。
- 存取控制：不在前端硬編碼 email；以 Google Drive 共享 ACL 作為真正權限來源。
- 未登入狀態：只顯示網站名稱與登入入口，不顯示相簿或媒體資訊。
- 媒體行為：列表只載入預覽縮圖；點擊照片或影片後才載入完整媒體。
- 第一版不包含：搜尋、留言、通知、後端服務或跨資料夾同步。

## 架構

### 前端檔案

- `index.html`：語意化頁面結構、登入牆、設定引導、相簿殼層、燈箱與播放器容器。
- `styles.css`：桌面與手機版樣式、載入中、錯誤、空狀態、權限失效與 Picker 設定引導的視覺樣式。
- `app.js`：Google Identity Services、Google Picker、Drive API、狀態管理、媒體載入、上傳與刪除流程。
- `tests/app.test.mjs`：Node 原生測試，涵蓋可獨立測試的資料解析、Drive query、錯誤分類與設定儲存邏輯。
- `package.json`：只提供 `node --test` 測試指令，不新增執行期後端或建置工具。
- `README.md`：Google Cloud、OAuth、Picker、共用資料夾、GitHub Pages 與手機測試說明。

### Google Cloud 設定

前端設定區保留下列公開設定，但不得放入 Client Secret：

- 現有 OAuth Web Client ID。
- `PICKER_API_KEY`：限制 HTTP referrer 為 `https://alin080417-maker.github.io`，API restriction 只允許 Google Picker API。
- `GOOGLE_CLOUD_PROJECT_NUMBER`：提供給 Picker 的 App ID。
- `SCOPES`：維持 `https://www.googleapis.com/auth/drive.file`。

Google 官方 Picker web guide 要求 Cloud project、啟用 Picker API、API key、OAuth Client ID 與 App ID；Browser API key 應加上來源與 API 限制。參考：[Integrate the Google Picker into web apps](https://developers.google.com/workspace/drive/picker/guides/web-picker)。

## 資料流

1. 頁面載入 Google API Loader、Google Picker 與 Google Identity Services。
2. 未登入時顯示登入牆；登入後取得短期 access token。
3. 讀取本機的共用資料夾設定。
4. 若沒有 folder ID，或使用者點選重新設定，建立只允許選取資料夾的 Google Picker。
5. Picker callback 只接受資料夾項目，儲存 folder ID、名稱與選取時間。
6. 使用 Drive API 查詢 selected folder 的直接子資料夾作為相簿，並查詢 selected folder 與各相簿中的圖片、影片。
7. 所有列表 API 都處理 `nextPageToken`，避免固定 200 筆造成資料遺漏。
8. 點選相簿後更新目前 folder ID；點擊媒體後才建立完整媒體的載入 URL。
9. 權限失效或 folder 被刪除時，清除本機選擇並返回資料夾設定引導。

## 媒體載入與手機體驗

### 縮圖列表

- 使用 Drive 回傳的 thumbnail URL 作為卡片預覽。
- 圖片使用 `loading="lazy"`，並保留合理的固定預覽尺寸。
- 影片卡片只顯示縮圖或輕量預覽，不在列表建立完整影片來源。
- 所有來自 Drive 的檔名、標題、備註與日期以 `textContent` 或 DOM API 寫入，避免以未轉義字串組成 HTML。

### 完整照片

- 使用者點擊卡片後才取得完整照片。
- 燈箱只保留目前媒體的完整來源，關閉或切換時釋放不再使用的 object URL。
- 顯示載入中與載入失敗狀態，不讓空白燈箱看起來像是沒有資料。

### 完整影片

- 使用者點擊卡片後才設定 `<video>` 的來源。
- 播放器使用 `controls`、`playsinline`，不自動播放。
- 為了手機上的漸進式載入與播放，完整影片使用短期 access token 的 Drive 媒體 URL；該 URL 只在使用者點擊後於執行期建立，不寫入 localStorage、不放入 HTML 靜態內容，也不傳給第三方服務。
- 關閉燈箱時清除影片來源並呼叫 `load()`，避免背景繼續下載。

這是純前端部署下「手機可直接播放」與「不讓 token 出現在任何媒體請求」之間的明確取捨；第一版優先手機播放體驗。若未來要完全避免 token URL，需導入後端媒體 proxy 或改用完整 Blob 載入。

## 安全與錯誤處理

- 不新增 Client Secret；OAuth Client ID 與受限制的 Browser API key 視為公開前端設定。
- 不在頁面內容、localStorage 或 URL query 持久化 access token。
- 不信任 Drive 的檔名、資料夾名、description 或 userinfo 內容；禁止直接把這些值插入 `innerHTML`。
- `gFetch` 依 HTTP status 分類錯誤；204 No Content 不嘗試解析 JSON。
- 上傳 XHR 檢查 HTTP status、解析錯誤回應、顯示檔案級錯誤，並避免失敗時顯示成功。
- 選取資料夾、列舉媒體、建立相簿、上傳、刪除與載入完整媒體都使用可讀的繁體中文錯誤訊息。
- API token 失效時清除記憶中的 token，要求重新授權；Drive 403/404 時清除 folder 設定並提供重新選取。
- 上傳前檢查 MIME type，只接受 `image/*` 與 `video/*`；保留瀏覽器的檔案選擇器限制，拖放也使用同樣驗證。
- 刪除前顯示項目名稱與二次確認；只使用 Google Drive 的可復原刪除流程。

## 測試與驗收

### 自動測試

使用 Node 內建 test runner，不需要額外測試框架。至少涵蓋：

- metadata JSON 的建立、解析與舊格式 fallback。
- 日期與檔名的顯示格式。
- Drive query 的 folder ID escaping。
- folder ID 的儲存、讀取、清除與無效值處理。
- HTTP status 分類，包含 204、401、403、404 與 5xx。
- 上傳錯誤回應不會被判定為成功。
- 媒體 URL 只在點擊流程建立，且登出/關閉播放器會清除來源。

每個新增或修正的純函式先寫失敗測試，再實作最小修正，最後重新執行完整測試。

### 靜態與手動驗證

- `node --check app.js` 通過。
- `npm test` 通過且無失敗。
- 檢查不存在 `YOUR_GOOGLE_CLIENT_ID`、未設定 Picker config 或明文 Client Secret。
- 桌面瀏覽器：登入、Picker 選資料夾、切換相簿、預覽、完整照片、影片播放、上傳、刪除、重新選取。
- 手機尺寸：登入牆、雙欄縮圖、燈箱、影片播放、拖放替代的檔案選擇器、進度列與錯誤訊息。
- 權限情境：未共享帳號、撤銷資料夾權限、資料夾不存在、token 過期與網路中斷。

## 部署與文件驗收

- GitHub Pages 使用 `main` 根目錄，不需建置步驟。
- README 明確說明：啟用 Drive API 與 Picker API、建立 OAuth Web Client、加入 GitHub Pages origin、建立並限制 Browser API key、填入 project number、分享資料夾給女友、兩個帳號首次選取相同資料夾。
- README 明確說明 Client Secret 不應放入前端，且 Google Drive 共享 ACL 才是資料權限來源。
- Draft PR 以 `main` 為 base，描述改動、根因、驗證命令與仍需由使用者在 Google Cloud Console 完成的設定。

## 非目標與風險

- 不建立後端、不保存應用程式資料庫、不實作聊天或通知。
- 不以 email allowlist 取代 Drive ACL；前端 allowlist 不能成為真正安全邊界。
- 共用資料夾中的任何 Editor 都能透過 Google Drive 直接刪除或修改檔案；網站的二次確認只改善操作安全，不改變 Drive 的實際權限。
- 瀏覽器 localStorage 只記住 folder ID；清除網站資料、換裝置或換瀏覽器時需要重新使用 Picker。
- 大型影片仍受 Google Drive、瀏覽器、網路與手機記憶體限制；第一版只保證點擊後才載入，不承諾離線播放或轉碼。

## 完成條件

只有在以下條件全部滿足後才可將 Draft PR 標記為可審查：

1. 兩個有共用資料夾權限的 Google 帳號能在 GitHub Pages 上選取同一資料夾並看到相同相簿。
2. 縮圖不會預先下載完整影片；點擊後照片與影片能在手機版燈箱載入。
3. 上傳、建立相簿、刪除與重新選取資料夾都有成功與失敗狀態。
4. 204、401、403、404 與上傳非 2xx 回應都有測試或明確手動驗證。
5. 遠端資料不再以未轉義 HTML 注入 DOM。
6. README、Google Cloud 設定清單與 GitHub Pages URL 完整。
7. `npm test`、`node --check app.js` 與手動手機驗證均有新鮮輸出紀錄。
