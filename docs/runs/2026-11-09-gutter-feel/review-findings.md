# Code Review Findings — 水溝過彎手感

結論：沒有 Critical。有 1 項 Important：`physics()` 裡每一步的卡水溝紀錄沒有測試。另有 3 項 Minor 值得處理，2 項可以不處理。審查者的結論是可以上線。這一版已經上傳（Version 19），上傳時 review 還沒結束。處置等使用者決定。

審查者：fresh-context code-reviewer subagent（唯讀）。比對基準：`yatouge.before.html` 對 `yatouge.html`。`node --test` 48/48。

## CR1 — `physics()` 的卡水溝紀錄沒有測試（Important）
- 位置：`yatouge.html:957-965`
- 說明：純函式都有測，但下面這些寫在 `physics()` 裡的邏輯沒有任何 node 測試涵蓋，日後改壞時測試仍會通過：
  - 剛卡入時歸零卡住時間、記下進入位置；卡住期間累加卡住時間。
  - 打方向脫出的分支。
  - 冷卻時間的更新順序。
  - 脫出後清除 `gutSide`。

  瀏覽器驗證有實際跑過這段，所以這是將來退化的風險，不是現有的 bug。
- 建議修法：把這段抽成純函式（例如 `gutterTick`），並補測試。
- Disposition: pending

## CR2 — 不是因為打方向而脫出時，也會被往外推（Minor）
- 位置：`yatouge.html:962`
- 說明：卡住滿 1 秒、手上正在打方向時，即使是因為溝的盡頭、超速、倒車或撞牆懲罰而脫出，也會套用往外 2.5 m/s 的推力和 0.6 秒冷卻。這與計畫不符，但影響不大。
- 建議修法：讓 `gutterGrip` 回傳脫出原因，只在原因是打方向時才推。
- Disposition: pending

## CR3 — 卡住後不給油，車子可以幾乎停在溝裡（Minor）
- 位置：`yatouge.html:451-454`
- 說明：速度會指數衰減但不會歸零，所以車子會一直卡著，溝的噪音與震動也一直持續。剎車、倒車或打方向都能脫出，並不會永久卡死。
- 建議修法：速度低於約 0.5 m/s 時自動脫出。
- Disposition: pending

## CR4 — 按 R 重置時沒有清除下沉外觀（Minor）
- 位置：`yatouge.html:1390`
- 說明：下沉會在約 0.12 秒內自然恢復，只影響外觀。建議在 `resetCar` 補上 `gutDrop: 0`，與 `resetRace` 一致。
- Disposition: pending

## 其他 Minor（建議不處理）
- CR5：脫出推力的大小只用一步的斷言驗證。
- CR6：舊的測試沒有傳入 `gutCool`，是靠 `undefined > 0` 為 false 才通過的。目前無害。
- Disposition: pending

## 使用者處置（2026-11-09）
- CR1、CR2、CR4：fix-now，已修正。`node --test` 52/52，verifier 在瀏覽器重新驗證後全部 PASS，已上傳為 Version 20。
- CR3、CR5、CR6：不處理。

## Dropped on verification
- 無。
