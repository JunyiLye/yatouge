# 變更報告 — 新增賽道「青嵐峠」

結論：`yatouge.html` 新增第二條賽道「青嵐峠 / Seiran Pass」（約 5.2 km、9 個髮夾彎），路線依使用者的手繪圖描出；原本的黑鷺山中心線逐位元不變。測試 12/12 通過，獨立瀏覽器驗證 PASS，code review 無 Critical。已依使用者指示（「做完後上傳」）更新到原本的 artifact 連結。Review 提出的 3 項 Important 仍待使用者決定處置，尚未修改。

## Why
使用者要求保留現有賽道，另外依提供的路線圖新增一條。使用者決定：比例每像素 3 公尺、從圖左下尾端出發。

## What
- `yatouge.html`：純幾何區塊（`@course-geometry`）、`TRACKS`（黑鷺山 + 青嵐峠內嵌 329 個路點）、`buildTrack(id)` 重建並 dispose 賽道物件、主畫面賽道選擇（存在 `yatouge-track`）、各賽道個人最佳（黑鷺山沿用 `yatouge-best`）、文案帶入賽道名稱。
- 新增 `tests/track.test.mjs`（`node --test`）。
- 本資料夾不是 git repo：沒有工作分支、checkpoint commit、diff stat 與 SHA；比對基準為 `yatouge.before.html`。
- Skip Rules：Light Path（略過 API grounding 與 spec 步驟，無 Design Gate 停點）。

## Evidence（依 plan 的 Exit Criteria 順序）
1. `node --test` 全數通過 → 12 tests、12 pass、0 fail（maker、orchestrator、verifier 各自跑過）。
2. 每個寫程式的任務都有先紅後綠的持久化測試 → maker 回報任務 1–5 各自的紅燈訊息（如「找不到 @course-geometry 區塊」、`g.courseBounds is not a function`）與綠燈輸出。紅燈歷史只有 maker 的紀錄，verifier 無法獨立重現。
3. 兩條賽道、兩種語言載入時 Console 無錯誤 → verifier 實測無 pageerror（唯一錯誤是測試伺服器自己的 favicon 404）。
4. 兩條賽道可選、重新整理後保留選擇、`#courseInfo` 正確 → 「黑鷺山 · 下坡 2.4 km · 6 個髮夾彎」與「青嵐峠 · 下坡 5.1 km · 9 個髮夾彎」，重新整理後仍為青嵐峠；比賽中點選無效。
5. 黑鷺山起點外觀與改動前相同 → 點數、終點距離、起終點門、車輛與相機位置數值完全相同，倒數畫面截圖除遠山外逐像素相同。
6. 青嵐峠可開、對手前進、HUD 進度前進、形狀與原圖一致且未鏡像 → 踩油門 4 秒達 109 km/h，對手與進度條都有前進；俯視圖與 `route-source.png` 形狀、長寬比一致，起點在左下、終點在右上。
7. 青嵐峠完賽寫入 `yatouge-best-seiran`、不動 `yatouge-best` → 已確認；黑鷺山完賽仍寫入 `yatouge-best`。此項使用 verifier 的除錯副本（只多一行 `window.__dbg`）把車移到終點附近。
8. Build / lint → N/A（單一 HTML，無工具）。

未驗證：完整手動跑完 5 km、手機觸控操作。

Completeness check：未執行。review-findings.md 中所有處置都還是 pending（等使用者決定），依規則這種狀態無法通過檢查；待使用者決定後再跑。

## Decisions
- 使用者：比例 3 m/px、左下出發、做完後上傳到原 artifact 連結。
- 實作偏差（maker 提出，verifier 與 reviewer 未判定為缺陷）：路點局部放寬最多約 6 m；測試 3f 門檻改為 DS/HW；遠山距離公式改為不會壓到路面；星空分布略有不同。
- Review findings：見 `review-findings.md`，全部 pending。

## 未解問題與假設
- **CR1（青嵐峠兩個彎內側護欄扭曲）是否要修**：只影響畫面，不影響遊玩。這是上傳前的判斷，因為使用者已離開，且指示做完就上傳。若要修：再放寬那兩處路點，並收緊測試。狀態：open。
- **CR2、CR3 鍵盤無障礙**：既有的選車介面也有同樣問題。狀態：open。
- **賽道名稱「青嵐峠」**為暫定。狀態：open。
