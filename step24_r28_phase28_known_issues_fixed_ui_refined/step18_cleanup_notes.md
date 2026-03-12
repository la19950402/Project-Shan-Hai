# step18 legacy data model cleanup

本輪清理重點：
- `COLLECTIONS` 移除 `boss_configs` / `question_sets`
- 新增 `LEGACY_DOCS` 統一管理：
  - `_BATTLE_TOWER_BOSS_`
  - `_QUESTION_SET_META_`
- Boss / 題庫群組 UI 文案與 runtime 變數改成舊版相容語意
- 保留 `listQuestionSetConfigs()` API 名稱，避免 controller 斷裂；但實體資料只讀寫 `quiz_bank` 與其系統文件
