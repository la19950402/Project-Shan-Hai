# round27：canonical reread 與資料回讀驗證修正

Build: `step24-r28-card-batch-workflow-20260312a`

## 本輪重點

1. 修正 `fetchStudentByToken()` 的合併順序
   - 舊邏輯先對 `student_pages` 做 `applyDataMigration()`，會把 `logs` 等缺省欄位補成空陣列，再覆蓋 `students` 主檔。
   - 新邏輯改成先合併原始 `studentRaw/pageRaw`，最後才做一次 `applyDataMigration()`。
   - 這會保留 `students` 主檔的 canonical `logs`、`reward_events`、`reward_settled_ids` 等資料。

2. 新增 `fetchValidationSnapshot({ serial, token })`
   - 回傳：
     - `student`：`students/{serial}` canonical 主檔
     - `page`：`student_pages/{token}` 入口頁資料
     - `merged`：前端顯示用合併結果
   - 後續驗證改優先用 canonical `student`。

3. `saveStudentData()` 的 refreshAfterSave 改用 `fetchValidationSnapshot()`
   - 寫入後不再只靠 token merge 結果。
   - 目前回傳的 student 會保留主檔事件紀錄與主要資料。

4. 學生端每日作答 / Boss / 商城 / 隱藏蛋
   - 改成寫入後強制 reread canonical student 再驗證：
     - `coins`
     - `totalXP`
     - `logs`
     - `collection / hidden_eggs`
   - 不再只信 `settleRewardViaServer()` 或前端本地結果物件。

5. 批量模式改用 canonical reread 驗證
   - `applyBatchCardToActiveStudent()`
   - `runBatchScore()`
   - 會驗證：
     - XP / 屬性
     - debuff / learning_issues
     - 對應 logs

6. 老師端狀態寫入驗證補上 `teacher_status logs` 檢查

## 這輪主要目標

先修正「其實有寫進主檔，卻因 token 路徑合併錯位被誤判失敗」的問題，並把每日作答 / Boss / 批量模式都拉回 canonical 主檔驗證。

## 修改檔案

- `js/services/student-service.js`
- `js/controllers/student-core-controller.js`
- `js/controllers/batch-controller.js`
- `js/controllers/bootstrap-controller.js`
- `js/config.js`
- 相關 build tag 參照檔

## 已跑檢查

- `node --check js/services/student-service.js`
- `node --check js/controllers/student-core-controller.js`
- `node --check js/controllers/batch-controller.js`
- `node --check js/controllers/bootstrap-controller.js`
- `python tools/check_frontend_integrity.py`
