# Alan🌷Ting Shared Memories

這是一個部署在 GitHub Pages 的共用照片與影片相簿。你和女友各自使用 Google 帳號登入，並在第一次使用時透過 Google Picker 選取同一個 Google Drive 共用資料夾。

正式網址：

<https://alin080417-maker.github.io/AlanTing/>

## 功能

- 兩個 Google 帳號共用同一批相簿資料
- Google Drive 資料夾權限作為實際存取控制
- 照片與影片縮圖列表
- 點擊照片後才載入完整照片
- 點擊影片後才載入影片播放器
- 手機版雙欄相簿與 controls、playsinline 播放器
- 上傳照片與影片、標題、日期、備註
- 建立相簿
- 刪除前確認，刪除後移至 Google Drive 垃圾桶
- 拖放上傳與上傳進度
- 不使用後端、不保存 Client Secret

## Google Cloud 設定

請使用同一個 Google Cloud project 完成以下設定：

1. 啟用 Google Drive API。
2. 啟用 Google Picker API。
3. 建立或沿用 OAuth Web Client ID。
4. 在 OAuth Client 的 Authorized JavaScript origins 加入：

   https://alin080417-maker.github.io

5. 建立 Browser API key，並限制：

   - Application restrictions：HTTP referrers
   - Allowed referrer：https://alin080417-maker.github.io/*
   - API restrictions：只允許 Google Picker API
6. 記下 Google Cloud project number。
7. 編輯 app.js：

   - 將 PICKER_API_KEY 填入受限制的 Browser API key
   - 將 GOOGLE_CLOUD_PROJECT_NUMBER 填入 project number
   - 保留現有 CLIENT_ID
   - 保留 SCOPES = https://www.googleapis.com/auth/drive.file

API key 是公開的前端設定，必須依照上面的來源與 API 限制。不要把 Client Secret 放進 app.js、HTML、GitHub 或任何前端檔案；Web application 不需要把 Client Secret 放在瀏覽器中。

## 建立共用相簿

1. 在你的 Google Drive 建立一個根資料夾，例如 AlanTing Shared Memories。
2. 將這個資料夾分享給女友的 Google 帳號，至少給予可以新增與修改檔案的權限。
3. 你第一次登入網站時，按「開啟 Google Picker」，選取這個根資料夾。
4. 女友第一次登入網站時，也按「開啟 Google Picker」，選取同一個根資料夾。
5. 之後網站會在該瀏覽器的 localStorage 記住資料夾 ID；換手機、換瀏覽器或清除網站資料後，需要再選一次。

網站不使用 email allowlist。真正的權限由 Google Drive 共用 ACL 決定；如果帳號沒有資料夾權限，網站不會顯示資料。

## 發布到 GitHub Pages

1. 將 app.js 中的 Picker 設定填好。
2. 將修改提交並推送到 main。
3. 在 GitHub repository 開啟 Settings → Pages。
4. Source 選擇 Deploy from a branch。
5. Branch 選 main，資料夾選 / (root)。
6. 等待 GitHub Pages 完成部署。
7. 確認 Google OAuth 的 origin 與 Browser API key 的 HTTP referrer 都使用：

   https://alin080417-maker.github.io

GitHub Pages 是純靜態部署，不需要 npm build 或後端服務。

## 手機使用方式

- 相簿列表只載入預覽縮圖，不會預先下載完整影片。
- 點照片後才載入完整照片。
- 點影片後才載入影片；播放器不會自動播放，使用手機原生 controls。
- 上傳使用檔案選擇器；桌面瀏覽器也可以拖放照片與影片。
- 如果影片很大，載入速度會受 Google Drive、手機瀏覽器與網路狀況影響。

為了讓手機影片可以漸進式載入，完整影片 URL 只在點擊後於記憶體中建立，包含短期 access token；token 不寫入 localStorage，關閉播放器時會清除來源。若未來要求完全不讓 token 出現在媒體 URL，需要增加後端 media proxy。

## 本機驗證

本專案不需要安裝 runtime dependencies。若已安裝 Node.js，可執行：

    npm test
    node --test
    node --check app.js
    git diff --check

也可以用任意靜態檔案伺服器預覽，例如：

    python -m http.server 8000

然後開啟 <http://localhost:8000/>。若要測試 OAuth，必須將 localhost origin 也加入 OAuth Authorized JavaScript origins，並確保 Picker API key 有對應的來源限制。

## 常見問題

### Picker 顯示設定未完成

確認 PICKER_API_KEY 與 GOOGLE_CLOUD_PROJECT_NUMBER 已填入，Google Picker API 已啟用，且 API key 的來源限制包含 GitHub Pages 網址。

### 登入後看不到資料夾

確認目前登入的 Google 帳號被分享該資料夾，並重新按「重新設定資料夾」。兩個帳號必須在 Picker 中選取同一個資料夾。

### 顯示權限失效

網站會清除失效的本機 folder ID，請確認 Google Drive ACL 後重新選取資料夾。

### 照片縮圖空白

Google Drive 的縮圖受檔案權限與網路狀況影響。重新整理頁面，確認目前帳號仍能在 Google Drive 開啟該檔案。

### 上傳失敗

確認你對共用資料夾具有新增檔案的權限，並檢查網路與 Google Drive 配額。失敗的上傳不會顯示為成功。

## 專案結構

- index.html：語意化頁面結構與登入、Picker、相簿、燈箱容器
- styles.css：桌面與手機版樣式
- app.js：OAuth、Google Picker、Drive API、媒體載入、上傳與垃圾桶操作
- tests/app.test.mjs：Node 原生測試
