# Step 7.2 學生核心流程熱修

## 修正內容
- `bootstrapApp()` 補上 `bindStudentCoreEvents()`
- 修正學生核心流程按鈕：
  - 綁定目前學生 token
  - 執行每日答題測試
  - 執行 Boss 測試

## 根因
學生核心流程控制器雖然有匯入：
- `bindStudentCoreEvents`
- `syncStudentCorePanel`

但在 `bootstrapApp()` 初始化時沒有實際呼叫 `bindStudentCoreEvents()`，
因此按鈕顯示正常，但沒有任何事件綁定，所以會看起來「按了沒反應」。
