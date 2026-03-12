# Round24 調整摘要

Build: `step24-r28-card-batch-workflow-20260312a`

## 本輪調整重點
1. **分段載入防呆**
   - 新增 `js/controllers/bootstrap-stage.js`
   - `app.js` 先逐組 import 本地核心、Firebase 橋接、資料服務、控制器
   - 一旦某組失敗，直接在頁面上列出第一個失敗模組與 fetch 診斷，不再只剩抽象的 `bootstrap failed`

2. **初始化錯誤診斷更完整**
   - `app.js` 在分段載入失敗時，會補抓關鍵本地模組
   - 若失敗模組落在 Firebase 相關群組，會再抓 gstatic Firebase CDN 回應資訊
   - 核心殼層仍保留，避免整頁完全卡死

3. **JSON 匯入防呆**
   - 新增 `js/utils/runtime-safety.js`
   - `system-admin-service.js` 的 `importQuizBulk()` 改用 `safeJsonParse()`
   - JSON 格式錯誤時會回傳較明確的訊息，不再直接丟裸 `JSON.parse` 例外

## 本輪修改檔案
- `index.html`
- `js/app.js`
- `js/controllers/bootstrap-stage.js`（新增）
- `js/services/system-admin-service.js`
- `js/utils/runtime-safety.js`（新增）
- `js/config.js`（Build Tag 更新）
- 其餘 import query string 同步改為 `step24-r28-card-batch-workflow-20260312a`

## 已跑檢查
- `python tools/check_frontend_integrity.py`
- `node --check js/app.js`
- `node --check js/controllers/bootstrap-stage.js`
- `node --check js/services/system-admin-service.js`
- `node --check js/utils/runtime-safety.js`

## 建議驗證
1. 部署完整包後，確認畫面 Build 變成 `step24-r28-card-batch-workflow-20260312a`
2. 若初始化仍失敗，查看頁面上的「模組診斷」第一個 FAIL 模組
3. 測老師主導覽 / 系統區切頁 / 快捷入口是否仍由核心殼層保底
4. 到題庫 / 批量匯入區，輸入錯誤 JSON，確認會看到較清楚的錯誤訊息
