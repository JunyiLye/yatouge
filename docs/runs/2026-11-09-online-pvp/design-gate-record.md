# Design Gate 紀錄 — 線上 1 對 1 對戰

日期：2026-11-09
簽核：使用者在對話中回覆「Go ahead」，同意 `plan.md` 的規格、設計、任務與 Exit Criteria，沒有修改。

## 已簽核的 Exit Criteria
內容與 `plan.md` 的「Exit Criteria」一節相同，共 7 項。第 6 項（在 claude.ai 實際由兩位真人連線測試）列為使用者驗收，不是 Build Loop 的退出條件。

## 環境 fallback 決策
- 這個功能沒有 SIT/DEV 環境，也不需要 live contract check。
- Build Loop 中無法使用真正的 claude.ai room，一律改用 `?mockroom=1` 的 BroadcastChannel mock，在兩個分頁之間驗證。這是預先決定的做法，不需要再回頭詢問使用者。

## 已知取捨（使用者已接受）
- 碰撞在延遲下雙方可能不完全一致。
- 雙方開跑時間可能相差 0.1–0.3 秒。
- 這是休閒對戰，不做防作弊。
