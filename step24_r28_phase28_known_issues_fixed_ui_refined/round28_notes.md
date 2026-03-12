# Round 28｜補卡正式流程與批量掃描模式重構

Build: `step24-r28-card-batch-workflow-20260312a`

本輪重點不是細修視覺，而是把兩條最早定義的正式工作流往正確方向拉直：

1. **補卡 / 重綁改成 serial 驅動**
   - 卡務區新增 `補卡卡序 / serial` 輸入與 `依卡序查找補卡學生`
   - 先查學生，再顯示學生摘要、active token、舊卡 UID / 新卡 UID
   - `預覽補卡 / 重綁流程`、`一鍵補卡 / 重綁`、`卡務現場確認` 都改優先依這條卡務目標流程運作
   - 一鍵補卡完成後，若目前老師操作頁載入的就是同一位學生，會同步把當前學生切到新 token

2. **批量模式改成真正掃描模式節奏**
   - 新增 `開啟掃描模式 / 關閉掃描模式`
   - 掃描模式開啟後，狀態會顯示目前是 `等待學生卡` 或 `等待獎勵卡`
   - 感應學生卡後，會鎖定學生並明確顯示「10 秒內請感應獎勵卡」
   - 感應獎勵卡成功後，狀態會切回等待下一張學生卡
   - 若未先鎖定學生就掃獎勵卡，會直接阻擋並提示先掃學生卡

3. **批量盤查 / 現場確認文案跟著掃描狀態更新**
   - 盤查文字會一起顯示：掃描模式是否開啟、目前在等學生卡或獎勵卡

本輪主要修改檔案：
- `index.html`
- `js/state.js`
- `js/controllers/batch-controller.js`
- `js/controllers/bootstrap-controller.js`

已通過檢查：
- `python tools/check_frontend_integrity.py`
- `node --check js/controllers/bootstrap-controller.js`
- `node --check js/controllers/batch-controller.js`
- `node --check js/services/card-admin-service.js`
- `node --check js/services/student-service.js`
