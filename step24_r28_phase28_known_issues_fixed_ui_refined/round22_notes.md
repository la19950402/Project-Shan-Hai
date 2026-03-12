# round22 核心維修版

Build: step24-r28-card-batch-workflow-20260312a

## 這一版做了什麼

1. 保留原本完整 bootstrap 流程，但在 `app.js` 前面先啟動 **核心殼層**。
2. 新增 `js/controllers/bootstrap-lite.js`，先接手：
   - `data-nav-target` 導覽
   - `data-system-target` / `data-system-tab` 系統區切頁
   - `data-click-target` 快捷代理點擊
   - Build 顯示同步
3. 若完整 `bootstrap-controller` 成功，殼層顯示「完整模組已載入」。
4. 若完整 `bootstrap-controller` 失敗，殼層保留基本導覽，不讓整頁完全失效。
5. 全包 build tag 改為：`step24-r28-card-batch-workflow-20260312a`

## 本輪目的

- 先維修「完整 bootstrap 一失敗整頁幾乎不能動」的狀況
- 讓老師入口 / 學生入口 / 系統區 / 快捷導覽先能繼續操作
- 後續再回頭追真正導致 `Invalid or unexpected token` 的深層模組

## 已跑檢查

- `node --check js/app.js`
- `node --check js/controllers/bootstrap-lite.js`
- `python tools/check_frontend_integrity.py`

全部通過。
