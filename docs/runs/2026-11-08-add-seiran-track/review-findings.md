# Code Review Findings — 新增賽道「青嵐峠」

結論：沒有 Critical。1 項 Important 影響畫面（兩個最窄的彎內側護欄扭曲），2 項 Important 為無障礙（鍵盤操作）問題，另有數項 Minor。所有處置都還在等使用者決定，尚未修改任何程式。

審查者：fresh-context code-reviewer subagent（唯讀）。比對基準：`yatouge.before.html` → `yatouge.html`（本資料夾不是 git repo）。

## CR1 — 青嵐峠兩處彎道半徑約 5.3 m，內側護欄幾何會折疊（Important）
- 位置：`yatouge.html` 的 `SEIRAN_WP`，約 s≈1343 m（i=894–895）與 s≈3506 m（i=2337–2338）
- 說明：逐點曲率的最小半徑為 5.27 m，比護欄的偏移量（HW+0.3 = 5.5 m）、護欄柱的偏移量（5.62 m）還小。內側護欄會翻折，玩家在這兩個彎會看到扭曲的護欄。測試 3c 量的是平滑後的 `ks`（10.88 m），所以沒抓到。
- 建議修法：把這兩處的路點再放寬，並把測試 3f 改成以逐點 `k` 檢查半徑 ≥ HW+0.5。
- Disposition: pending
- Status: open

## CR2 — 選賽道後鍵盤焦點消失（Important）
- 位置：`yatouge.html:1174-1187`（`setTrack` → `applyLang` → `renderTrackPicker` 重建按鈕）
- 說明：用鍵盤或螢幕閱讀器選賽道後，焦點會掉到 `<body>`。既有的選車介面也有同樣的寫法。
- 建議修法：重建後把焦點放回同一個位置的按鈕。
- Disposition: pending
- Status: open

## CR3 — radiogroup 沒有方向鍵操作（Important）
- 位置：`yatouge.html:156, 1177`
- 說明：`role="radio"` 的按鈕每個都是 tab stop，也沒有方向鍵切換；這和既有的選車介面一樣。
- 建議修法：兩個選擇器共用一個小的方向鍵處理，或拿掉 radio role。
- Disposition: pending
- Status: open

## Minor（一併記錄，建議 defer）
- CR4：黑鷺山只有中心線逐位元相同；遠山距離與星空分布有變（已是接受的偏差）。
- CR5：青嵐峠遠側的山可能被相機遠裁切面（2400 m）切掉一部分，尚未目視確認。
- CR6：測試 4 幾乎是套套邏輯，沒有測到 `buildTrack` 的呼叫點。
- CR7：測試 3b 重複寫了比例 3，沒有引用常數。
- CR8：青嵐峠的樹密度約為黑鷺山的一半（樹的數量上限固定）。
- CR9：「選擇賽道」標題沒用 `aria-labelledby` 綁到 radiogroup（與既有選擇器相同）。
- CR10：未確認 three r128 的 `InstancedMesh.dispose` 是否存在；若不存在，每次切換賽道會漏約 90 KB GPU buffer。
- Disposition: pending

## Dropped on verification
- 無。
