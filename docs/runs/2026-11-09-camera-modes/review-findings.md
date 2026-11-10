# Code Review Findings — 鏡頭模式

結論：沒有 Critical。renderer 狀態的保存與還原、車身隱藏與顯示、up 向量與 FOV 的還原、原本 chase 模式不變，這幾項都正確。2 項 Important：手機寬度時後照鏡被 HUD 面板擋住；測試只涵蓋純函式，而且有幾個測過的輸出遊戲根本沒用到。處置等使用者決定（手機版版面以 verifier 的實測結果為準）。

審查者：fresh-context code-reviewer subagent（唯讀，沒有開瀏覽器）。

## CR1 — 手機寬度時後照鏡與 HUD 面板重疊（Important）
- 位置：`yatouge.html` 約 1440–1446 行（`layoutMirror`），CSS 約 33–34 行
- 說明：寬 360 px 時後照鏡寬 150 px，位置約 x 105–255、y 59–106。左上的時間面板與右上的分數面板都從 y 12 開始、高約 90 px，會蓋住後照鏡的一部分；觸控裝置上的速度表在 y 96 也會碰到。這是審查者算出來的，等 verifier 以瀏覽器確認。
- 建議修法：窄螢幕時把後照鏡移到面板下方（約 y 110），或縮小。
- Disposition: pending

## CR2 — 整合部分沒有測試，部分測過的輸出沒被使用（Important）
- 說明：`cockpitPose` 回傳的 `eye`、`fwd`、`mirrorDir` 遊戲沒有使用，遊戲只用 `local` 和 `mirrorLocal`，再透過 `localToWorld` 換算。所以「眼睛在車內」等測試驗證的是用不到的值。renderer、`syncBody`、按鍵與記住選擇都沒有測試，只能依賴瀏覽器驗證。
- 建議修法：刪除沒用到的輸出，直接測 `local`；整合部分以瀏覽器驗證結果為證。
- Disposition: pending

## Minor
- CR3：cockpit 與 near 模式每一幀都建立幾個小物件，可以改用預先配置的物件。
- CR4：天空跟著主鏡頭移動，不跟後照鏡相機，差距不到 1.5 m，看不出來。
- CR5：後照鏡貼圖沒有抗鋸齒，256×80 可以接受。
- CR6：離開 cockpit 時 FOV 約 0.3 秒才回到原值，屬於外觀問題。
- Disposition: pending

## Dropped on verification
- 無。

## 使用者處置（2026-11-09）
- CR1：verifier 擋下後已修正（手機版後照鏡改放在面板下方，工具列不換行），重新驗證 PASS。
- CR2、CR3、CR6：fix-now，已修正。`node --test` 96/96（當時），重新驗證 PASS。
- CR4、CR5：不處理。
- 已上傳為 Version 23。
