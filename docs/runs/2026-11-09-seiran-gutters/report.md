# 變更報告 — 青嵐峠水溝過彎

結論：青嵐峠第 2 到第 5 個連續髮夾彎（約 3.56–3.91 km）的內側加了水溝。內側車輪壓進水溝時，車子會卡住並沿著彎道繞過去，每次要扣 1,000 甩尾分數。測試 42/42 通過，獨立 verifier 在瀏覽器的最終驗證為 PASS，code review 沒有 Critical。已更新到原本的 artifact 連結（Version 18）。黑鷺山不變。

## Why
使用者想用水溝過彎作為獎勵：先靠甩尾累積分數，再拿分數換取在連續髮夾彎裡高速通過。

## What
- `yatouge.html` 新增純函式區塊 `@gutter`：
  - `gutterSections` 偵測 4 個彎與內側方向。
  - `gutterGrip` 判定是否在水溝：進入時 `|lat|` 在 3.6–4.2；已卡住時可維持到貼牆上限，速度與角度門檻也放寬。只在溝完整顯示的範圍內有效，頭尾 3 m 的漸變處不算。
  - `gutterStep` 計算卡水溝時的物理：沿道路切線前進，每秒衰減 4%，速度上限 24 m/s。
  - `gutterApply`、`gutterToll`、`gutterSpend` 處理扣分：先把連段分數入帳再扣 1,000，同一段、同一趟只扣一次，不會扣成負數，結果取整數。撞牆懲罰期間，或最近 1 秒內碰過護欄時，不卡、不扣分、不提示。
- 外觀部分：0.7 m 寬、0.12 m 深的混凝土溝，加上緣石與格柵；卡水溝時車身內傾、鏡頭輕微震動、有低沉噪音。
- 中英文字串：`gutter`、`gutterLow`、`gutterNeed`。
- 新增 `tests/gutter.test.mjs`（29 個測試）。
- 本資料夾不是 git repo，沒有分支和 commit。比對基準為 `yatouge.before.html`。
- Skip Rules：Light Path，略過 API grounding 與 spec 步驟，沒有 Design Gate 停點。

## Evidence（依 plan 的 Exit Criteria）
1. `node --test`：42 tests、42 pass、0 fail。maker、verifier 與 orchestrator 都各自跑過。
2. 先紅後綠：每一輪的紅燈輸出存在 `red.txt` 到 `red4.txt`。i18n 測試例外：它測的是已存在的字串，紅燈只是 regex 寫錯造成的，不是真正的紅燈。
3. Console：兩條賽道、兩種語言都只有 favicon 404，沒有程式錯誤。
4. 水溝位置：第 2 個彎內側有水溝（`verify-hairpin2-gutter.png`），第 1 個彎沒有（`verify-hairpin1-nogutter.png`），黑鷺山 0 段。
5. 卡水溝：1,000 分，在第 2 個彎以 18 m/s 進入。車子一直卡到 s1−3，最大 |lat| 為 4.196，分數從 1000 變成 0，提示有出現。最後一輪提示被「超車」提示蓋掉，前兩輪都有看到。
6. 從路中央進彎：不會卡。撞上第 2 彎外側護欄、貼著護欄滑進第 3 彎的區段時，1,500 分與 999 分都不扣分、不提示，`gutSide` 也不閃爍（最後一輪 verifier 實測）。
7. 黑鷺山不變：雜湊測試通過。
8. Build / lint：N/A。

另外驗證：頭尾漸變處不卡；扣分後為整數；30 m/s 不卡；沒有 NaN。

未驗證：手動完整試玩手感、卡水溝的音效聽感。

## Build Loop 紀錄
Verifier 共擋下三次，都是撞上護欄後被誤判為卡進水溝。
- 第一次修法是把判定帶上限改為 4.2。
- 第二次加上撞牆懲罰期間不能卡。
- 第三次依使用者決定：最近 1 秒內碰過護欄就不能卡。

詳見 `review-findings.md`。

## Decisions
- 使用者決定：
  - 位置選第 2 到第 5 個彎。
  - 手感為「卡水溝高速繞彎」。
  - 每次扣 1,000 分，取消 +300 加分，分數不足時不卡。
  - 按 R 重置後同一趟不重複扣分。
  - review 中的 CR1、CR4–CR8 立即修，CR3 延後處理。
  - 碰到護欄後 1 秒內不能卡。
- 實作偏差：
  - 用 `GUTTER_ZONES = [3540, 3920]` 限定偵測範圍，排除第 1 個彎。
  - 原有的髮夾彎偵測抓不到第 4 個彎，改用平滑曲率偵測。

## Completeness check
review-findings 中所有 fix-now 項目（CR1、CR4–CR8）以及 V1–V3 都有對應的測試，最終 verifier 也通過。這次的檢查由 orchestrator 自己逐項對照，沒有另外派 Verifier／Adversary subagent，這與流程不同，原因是使用者希望縮短等待時間。

## 未解問題與假設
- 速度上限 24 m/s、每次扣 1,000 分、溝的尺寸都是暫定數值，等使用者試玩後再調整。狀態：open。
- CR3：卡進水溝的瞬間方向會直接轉正，甩尾中卡入可能感覺很突然。狀態：deferred。
- 第 1 與第 2 個彎之間有一個約 125° 的左彎（約 3.52–3.56 km），沒有加水溝。狀態：已告知使用者。
