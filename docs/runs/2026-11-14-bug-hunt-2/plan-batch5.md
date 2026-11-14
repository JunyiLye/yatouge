# 第二次深度檢查第 5 批：單機與操作的小問題（2026-11-14）

結論：修正第二次深度檢查在單機、介面與操作找到的 8 個 bug（R1-1～R1-4、R3-1、R3-2、R3-3／R4-2、R4-1、R5-3）。使用者不在，修法由我依建議方案決定。手感、物理、車輛模型、聲音的個性都不變。線上的三項（R2-1、R5-1、R5-2）放在第 6 批。

## 各項修法
1. **R1-1 自選音樂被拒絕**：在主畫面選檔被拒絕（不是音訊檔、太大、無法讀取）時，把錯誤顯示在主畫面看得到的地方：音樂按鈕旁的狀態文字，沿用既有樣式，數秒後清除或下次操作時清除。`startRace` 開始時清掉 `#pop` 與 `popTimer`，上一場或主畫面留下的提示不會出現在倒數上。比賽中選檔的行為不變。
2. **R1-2 綁 Ctrl 後 Ctrl+W 關分頁**：網頁無法攔截 Ctrl+W／Ctrl+T／Ctrl+N。做法：按鍵設定頁把動作綁成 Ctrl（左或右）時，若目前有動作綁在 W、T 或 N，顯示一行警告（zh／en），說明按住 Ctrl 同時按這些鍵會被瀏覽器當成關閉或開新分頁。只警告、不阻止，預設按鍵不變。其他方案：禁止綁 Ctrl（會撤回第 2 批的功能，不採用）；自動改鍵（會改玩家的設定，不採用）。
3. **R1-3 焦點**：結果畫面「同一台再跑」打開變速箱詢問，取消時焦點回到 `#btnAgain`。
4. **R1-4 AltGr**：`kbModHeld` 在 code 為 `AltRight` 時同時忽略 `ctrlKey`（Windows 的 AltGr 會帶 ctrlKey）。
5. **R3-1 車門字樣**：`setKx` 開關車門字樣時遵守車身隱藏狀態（與 `syncBody` 用同一個規則），車內視角時不會單獨顯示。
6. **R3-2 引擎聲**：`resetRace` 把 `car.gas`、`car.brakeOn` 設為 false。
7. **R3-3／R4-2 同時衝線**：AI 與玩家的完賽時間用同一個時鐘。玩家的完賽時間維持原本的算法（幀結束的 `raceT`），讓既有最佳紀錄可以比較；AI 改為在它衝線的那一幀，也記為該幀結束的時間。兩者在同一幀衝線時，用固定步長的子步順序判斷誰先過線（同一子步算平手時判玩家贏，或以過線距離比例插值，由實作者選較簡單且可測的一種並記錄）。玩家的時間數字完全不變；AI 的時間最多晚一幀。其他方案：兩者都改成子步時間（會讓玩家紀錄有微小差異，不採用）。
8. **R4-1 幽靈車浮空**：幽靈車關閉時仍持續更新 `r.gpos` 的位置索引（只是不畫），打開時立即在路面上。計時賽幽靈車開著時的行為完全不變。
9. **R5-3 手把扳機**：視窗 `blur` 時也把 `gp.last` 重設為 `GP_IDLE`（和 `chatClose` 相同的做法）。

## 不變
手感、物理、AI 比賽行為、車輛模型、聲音的個性、預設按鍵、線上協定都不變。

## Exit Criteria
- 每項都有先失敗後通過的 `node:test`（純函式或以 `new Function` 切出真正的函式）；`node --test` 全部通過。
- LF、無 `__lc`、無隱形字元、script 可解析。
- 更新紀錄 2026-11-14 那一版 zh／en 各加入玩家看得到的修正（幽靈車、同時衝線判定、自選音樂錯誤提示、Ctrl 警告、AltGr、手把扳機、引擎聲等，白話）。
- 瀏覽器驗證（一個 headless 瀏覽器）：幽靈車中途打開在路面上；自選音樂選錯檔主畫面有提示、開賽倒數沒有殘留；按鍵設定頁綁 Ctrl 有警告；重新開始後倒數期間引擎聲為怠速音量；頁面沒有錯誤。

## 實作紀錄

結論：9 個項目都已依計畫修正，每一項都先寫測試並確認失敗，再實作到通過。`node --test` 最後是 714 個測試、714 通過、0 失敗。沒有開瀏覽器、沒有啟動 server，所以計畫裡「瀏覽器驗證」那一條尚未執行，需要之後用一個 headless 瀏覽器補驗。所有新測試都在 `tests/bug-hunt-batch5.test.mjs`（用 `new Function` 加 `with` 範圍，切出 `yatouge.html` 裡真正的函式來跑）。

先失敗：第一次執行該檔 17 個測試全數失敗，失敗原因都是預期的（找不到新函式或區塊、斷言不成立，例如 `1.2 !== 0`、`true !== false`、`gpos idx 8`），不是測試本身寫錯。實作後該檔 17 個全部通過。

各項：
- R1-1：新增 `#ownMsg` 狀態文字（音樂按鈕下方，沿用 `kbnote` 樣式）與 `ownNote()`，被拒絕的檔案寫在這裡，5 秒後自動清除，選到好檔案時立刻清除；`ownPicked` 不再呼叫 `showPop`。`startRace` 開頭清掉 `#pop` 的 `show` 與 `popTimer`。比賽中（state 不是 title）選檔被拒絕時仍另外用 `showPop`，行為與原本相同。
- R1-2：`@keybind` 區塊新增純函式 `kbCtrlClash(keys)`；按鍵設定頁新增 `#kbWarn`，`kbRender` 在鍵盤分頁且有 Ctrl 綁定、同時 W／T／N 有綁定時顯示 zh／en 警告（`kbCtrlWarn`）。只警告，不阻止，預設按鍵不變。
- R1-3：`#btnAgain` 單機分支改成 `askTrans(startRace, '#btnAgain')`。
- R1-4：`kbModHeld` 的 ctrl 條件加上 `code !== 'AltRight'`。
- R3-1：`setKx` 的車門字樣可見性加上「玩家車且車身隱藏時為 false」。
- R3-2：`resetRace` 的 `Object.assign` 加入 `gas: false, brakeOn: false`。
- R3-3／R4-2：新增 `@finish-clock` 區塊的 `playerFirst(playerStep, rivalStep)`：用固定步長的子步編號（`stepN`）判斷誰先過線，同一子步算平手、判玩家贏（我選這個，比插值簡單且可測）。抽出 `raceSteps()` 取代 `frame` 裡的子步迴圈，在 race 狀態下記下玩家第一次過線的子步 `playerCrossN`；`rivalUpdate` 改記 `rivalCrossN`；`frame` 在 `raceT += dt` 之後把 `rivalFinishT` 蓋成 `raceT`（與玩家同一個時鐘，AI 最多晚一幀）。`finishRace` 的 `playerFinishT = raceT` 沒動，玩家時間數字不變；勝負改用 `playerFirst`。`resetRace` 一併重設 `stepN`、`playerCrossN`、`rivalCrossN`。
- R4-1：`placeGhost` 在幽靈車關閉時也照常更新 `gpos` 與 `locate`，只是不畫。
- R5-3：`blur` 也設 `gp.last = { ...GP_IDLE }`。

連帶修改既有測試：`tests/uphill.test.mjs` 的 `simRival` 測試轉接器原本讓 `rivalUpdate` 自己蓋時間戳，現在改成轉接器模擬 `frame` 的蓋章（仍用跨越當幀前的 `raceT`），所以「AI 軌跡與舊版逐位元相同」的比較不變，兩個測試恢復通過。

更新紀錄：2026-11-14 那一版 zh／en 各新增 9 條修正（幽靈車、同時衝線、自選音樂提示、Ctrl 警告、AltGr、手把扳機、引擎聲、車門字樣、焦點），英文以「Fix:」開頭、中文以「修正：」開頭。

檢查：LF 的 CR 數為 0；`__lc` 為 0；無隱形字元（U+2028／2029、零寬、bidi 皆為 0）；script 以 `new Function` 解析成功。

## 驗證與審查紀錄
- 瀏覽器驗證（一個 headless 瀏覽器、依序六個 context，可用記憶體 6.5 GB）：幽靈車中途打開與路面高度差 0.002 m；主畫面選錯音樂檔顯示「不是音訊檔」，倒數時 `#pop` 沒有殘留；綁左 Ctrl 後出現警告、恢復預設後消失；按住油門重新開始，倒數期間 `car.gas`／`car.brakeOn` 為 false；車內視角車門字樣維持隱藏、回到車外視角顯示；完賽時玩家時間等於 `raceT`、勝負與差距正確；沒有頁面錯誤；一般比賽倒數到 GO 正常。結束後 headless 程序數為 0。
- 獨立 code review：可以合併，沒有重大問題。保留不改的小地方：同一幀衝線時差距顯示 ±0.00 秒；錯誤訊息顯示的 5 秒內切換語言不會跟著換；`AltRight` 時忽略 ctrl 也會忽略真的 Ctrl+右 Alt 組合。
- `node --test`：714 個全部通過；LF、無 `__lc`。
