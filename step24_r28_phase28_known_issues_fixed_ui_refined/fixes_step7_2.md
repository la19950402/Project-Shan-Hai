# Step 7.2 整合修正說明

本版先整合目前已確認且可立即修正的內容：

1. 商城購買價格欄位修正
   - `bootstrap-controller.js` 原本把表單值傳成 `itemPrice`
   - `shop-controller.js / shop-service.js` 實際需要的是 `price`
   - 已統一改為 `price`

2. AI 夥伴前後端代號相容
   - 前端 `guide_mode` 使用 `cat_sage / baize / neutral`
   - 舊版後端 `askBaize` 對貓咪模式較穩定識別 `sage_cat`
   - 現已在 `guide-api.js` 加入轉換：
     - `cat_sage -> sage_cat`
     - `neutral -> sage_cat`（先避免掉回白澤預設）
     - `baize -> baize`

3. 前端 `logs` 去重止血
   - 在 `student-service.js` 新增 `dedupeLogs()`
   - 讀取學生資料時，會先對 `logs` 去重
   - 後續商店購買 / voucher 兌現新增 `log_id`，避免前端再持續放大重複 log

4. 學生核心流程結算後同步畫面
   - 每日答題 / Boss 結算成功後
   - 會將後端回傳的 `student` 套回 `currentState`
   - 並發出刷新事件，讓老師頁摘要跟著更新

> 注意：
> 這一版是前端整合修正，能止血並改善顯示與操作一致性。
> 若要從根源杜絕重複 `logs`，仍建議下一步同步修正後端 `settleStudentReward` 的 log 去重邏輯。
