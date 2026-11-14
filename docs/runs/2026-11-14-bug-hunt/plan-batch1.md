# 第一批修正：E2、E1、E3、C1、B1

結論：五個問題都已在 `yatouge.html` 修正並各有先失敗後通過的測試；`node --test` 共 608 個全部通過（修正前 590 個）。尚未在瀏覽器驗證。

## E2 線上多回合永遠顯示「勝」
- 原因：`p.dnfLocked` 只在 `startMatch` 初始化。某回合顯示過「未完賽」或「對手離開」後，之後每一回合都走 `lockedResult`，一律回傳勝。
- 修法：`beginCountdown` 開始每一回合時把 `dnfLocked` 重設為 false。
- 測試：`tests/round-reset.test.mjs`，用遊戲本身的 `beginCountdown` 與 `pvpResultTick` 模擬兩個回合。修正前第二回合（對手 50 秒、我 60 秒）顯示 win，修正後顯示 lose；同回合對手晚到仍維持勝的原行為也有測試。

## E1 Supabase 沒有廣播清除後的大廳狀態
- 原因：`sendLow` 在 low 為空時不送，所以 `{ lobby: null }` 不會傳給其他人，他們一直保留舊的大廳狀態。
- 修法：low 被清空時，改廣播空的 low `{}`，共 3 次（心跳會重送，廣播可能掉包），之後不再送。只用 broadcast，沒有增加 presence 的 `track()` 呼叫。接收端本來就接受空物件，模擬傳輸層沒有改動。
- 不做的事：沒有幫加入者與觀戰者加逾時。加入者的 presence 內容不變，`updatedAt` 只在內容變動時更新，沒有心跳，逾時會讓正常的加入者被當成過期。清除廣播已涵蓋離開的情況，離線則由名單移除與 bye 處理。
- 測試：`tests/supabase-lobby-clear.test.mjs`，真正的 `makeSupabaseRoom` 加假 SDK（同一個 hub 連三個用戶端）。客人離開後旁觀者立刻重新看到房間；主機清除後房間立刻消失；清除只多送最多 4 個空 low、`track` 次數不變。修正前三個測試都失敗。

## E3 離開大廳後才完成的加入仍會進房間
- 原因：`createRoom`、`createPrivateRoom`、`joinByCode`、`joinRoom`、`watchRoom` 的 `await` 完成後無條件進房間，離開大廳沒有取消它們。
- 修法：新增純函式 `makeGate`（`@lobbygate` 區塊，宣告在檔案前段）與 `lobbyGate`。五個函式在 await 前取得 token，完成後若失效只 `rm.leave()`。`closeLobby`（返回鈕、手把 B、`hideOnline` 都經過它）與 `startRace` 會 `cancel()`。
- 測試：`tests/lobby-gate.test.mjs`，token 邏輯、模擬加入中離開、五個函式與取消點的接線檢查。

## C1 衝線自動煞車遇到倒著甩尾會暴衝
- 原因：`vehicleAccel` 在 hold 且 vf <= 0.5 時回傳 `-vf / dt`（為不甩尾分支設計），甩尾分支只乘 0.3 倍，速度呈指數成長。
- 修法：`vehicleTurn` 在 `u.hold && u.brake && vf <= 0.5` 時先結束甩尾，改走不甩尾分支（vf 歸零，橫向速度依抓地衰減）。一般駕駛與下坡行為不變。
- 測試：`tests/handling.test.mjs` 新增，SR-7、20 m/s、drift、hold＋煞車，diff 1.8 / 2.2 / 2.8 rad，平地與坡度 0.08，速度每一步都不增加且 6 秒內停住。修正前第 0 步就加速（19.99 → 21.33）。

## B1 煞車時彎道提示消失又重新出現
- 原因：`nextSign` 每幀用目前速度重算 `lead = max(60, 速度 × 3)`，煞車使 lead 縮小，提示在進彎前消失，之後又出現並再嗶一次。
- 修法：`nextSign` 與 `nextTwoSigns` 多一個 `shown` 參數；正在顯示的那個彎維持到 `s > s0 + HOLD`。`turnSignFrame` 把 `tsCur` 傳進去。出現條件與 `side` 其他行為不變。
- 測試：`tests/turn-signs.test.mjs` 新增，三條賽道第一個髮夾（或大彎）40 m/s 接近，提示出現後以 24 m/s² 煞到 15 m/s，出現恰好一次、中途沒有消失；另有鎖定範圍與接線檢查。拿掉 `shown` 後測試失敗。

## 其他
- `@changelog` 2026-11-14 的項目補了五則修正（中英文）。
- 檢查：LF 換行（0 個 CR）、沒有 `__lc`、沒有隱形字元（`netcode.test.mjs` 原本就有 2 個，未改動）、script 可解析。

## 驗證與審查紀錄
- 瀏覽器驗證（一個 headless 瀏覽器，線上用模擬傳輸層兩個分頁）：B1、C1、E2、E3 全部通過，而且同樣的檢查在修正前的版本都會失敗；E1 由真正的 `makeSupabaseRoom` 加假 SDK 的 node 測試涵蓋。回歸腳本（遊戲內選單與線上流程 21/21、彎道提示 58/60（兩項是腳本仍期待提示文字在下方，新行為是放在旁邊）、衝線停車、更新紀錄 14/14）沒有退步。結束後 `chrome-headless-shell.exe` 為 0。
- 獨立 code review：可以合併。依審查修正：斷線時清除大廳狀態的廣播次數只在真的送得出去時才扣（加上離線再重連的測試）；更新紀錄的大廳文字改為「有人離開或關閉房間後，大廳列表會立刻更新」。
- 保留不改：重生後原本顯示中的彎道提示會繼續顯示（比原本合理）；取消加入後要等原本的加入結束才能再加入（修正前就是如此）。
- `node --test`：609 個全部通過。
