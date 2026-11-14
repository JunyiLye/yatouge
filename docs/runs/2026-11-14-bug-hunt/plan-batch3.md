# 深度檢查第 3、4 批：線上防護、起跑計時、終點後相撞（2026-11-14）

結論：修正四個問題：對手比賽中換車造成的重建卡頓（B3）、presence 呼叫次數沒有在用戶端控管（E5）、起跑「GO」與彎道提示各用一個計時器而偶爾差一幀（第 2 批驗證時發現）、AI 衝線後停在路中央與玩家相撞（C2）。修法由我依建議方案決定。

## 各項修法
1. **B3 對手比賽中換車或換色**：只在房間的「等待／準備」狀態處理對手的車種與顏色變化並重建模型；倒數、比賽、完賽中收到的變化先忽略，回到房間時再套用。其他方案：在 `roomState` 直接拒絕整筆狀態（會讓對手的位置也被丟掉，不採用）。
2. **E5 presence 呼叫次數**：在 Supabase 傳輸層加一個用戶端計數器，記錄最近 30 秒的 `track()` 次數；第 5 次以內立即呼叫，超過時把這次 `track()` 延後到最早一次滿 30 秒後才送（排隊，不丟掉）。延後期間大廳顯示「連線較忙，請稍候…」。檢查 `track()` 的結果，不是成功時在 3 秒後重試一次（同樣受計數器限制）。正常操作（進大廳、建房或加入一次）完全不受影響。其他方案：超過時直接禁止加入（體驗較差，不採用）。
3. **起跑 GO 與彎道提示同步**：GO 字樣的清除改由同一個時間 `goUntil` 判斷（主迴圈中時間到就清除），不再另外用 700 ms 的計時器，兩者不可能再差一幀。玩家看到的 GO 時間不變（0.7 秒）。
4. **C2 AI 衝線後相撞**：AI 衝線後超過終點時，不再和玩家做車對車碰撞；被賽道末端擋住時速度直接歸零（輪子不再空轉）。比賽中（衝線前）的碰撞完全不變。其他方案：延長賽道末端讓 AI 慢慢停（要動賽道資料，不採用）；衝線後讓 AI 靠邊（改變外觀行為，不採用）。

## 不變
手感、物理、車輛模型、AI 在比賽中的行為、線上協定版本都不變。

## Exit Criteria
- 每項都有先失敗後通過的測試：B3（比賽中換色不重建、回房間後套用）、E5（假 SDK：連續 6 次 track 在 30 秒內只送 5 次，第 6 次延後送出；結果失敗會重試；正常流程不延遲）、GO（同一幀內 GO 字樣與大型提示不會同時出現）、C2（AI 衝線後不與玩家碰撞、被擋住時速度為 0、衝線前碰撞不變）。`node --test` 全部通過。
- 換行只有 LF、沒有 `__lc`、沒有隱形字元，script 可以解析，頁面載入沒有錯誤。
- 瀏覽器驗證（一個 headless 瀏覽器）：輸給 AI 時衝線後沒有撞擊；贏 AI 時 AI 衝線後也沒有撞上；白狼峠起跑大型提示在 GO 消失後才出現（多次重跑不會提早）；線上模擬房間正常建立、加入、對戰；回歸腳本不退步。
- 更新紀錄加上玩家看得到的修正。

## 實作紀錄
結論：四項都已實作並有先失敗後通過的測試，`node --test` 共 649 項全部通過（改動前 640 項加新測試；兩個既有測試因設計改變而更新）。尚未在瀏覽器驗證。

1. **B3**：`ingest` 只在 `p.st` 為 waiting／ready 時重建對手車模，其他狀態不記 `oppKey`；`pvpToRoom` 把 `lastPres` 設為 null，回房間後下一次輪詢就會套用。測試 `tests/ingest-car-change.test.mjs`（跑真正的 `ingest`，假的場景與車模工廠）。先失敗：countdown／racing／finished 三項與 pvpToRoom 一項失敗，waiting／ready 兩項通過（證明測試裝置有效）。
2. **E5**：`@supa` 區塊新增純函式 `makeTrackBudget(limit, windowMs, now)`（`reserve()` 回傳要等的毫秒數並登記名額）；`SUPA` 新增 `TRACK_MAX 5`、`TRACK_WIN_MS 30500`（含 0.5 秒餘裕）、`TRACK_RETRY_MS 3000`。`makeSupabaseRoom(load, onBusy, budget, retryMs)` 的 SUBSCRIBED 改走 `sendTrack`：超量排隊延後送、結果非 'ok' 或被拒絕時 3 秒後重試一次（也要先取名額）、離開頻道會清掉排隊中的計時器。遊戲端傳入 `trackBusyNote`，大廳顯示 `trackBusy`（zh／en）。測試 `tests/track-budget.test.mjs`（假 SDK）。先失敗：`makeTrackBudget` 不存在，六項全失敗。
3. **GO**：移除 700 ms 計時器，新增 `goTick(now)`，在主迴圈 `hud()` 之前呼叫，到期同時清 GO 字樣與 `goUntil`；`turnSignFrame` 改為只看 `goUntil > 0`。測試 `tests/go-clear.test.mjs`（逐毫秒模擬：有 GO 字與 goUntil 在擋永遠一致，GO 顯示剛好 700 ms）。先失敗：四項全失敗。更新 `tests/turn-sign-styles.test.mjs` 中依賴舊計時器與「turnSignFrame 自己比時間」的兩個測試。
4. **C2**：新增 `@finish-hit` 區塊：`carsMayCollide(rivalS, playerS, finishS, state)`（AI 過終點、或 done 且玩家過終點時不碰撞）與 `rivalAdvance(s, v, dt, endS)`（未到末端與原本 `Math.min` 逐位元相同，被擋住時 v = 0）。`physics` 的車對車碰撞多加此判斷，carStep 呼叫文字不變；`rivalUpdate` 改用 `rivalAdvance`。測試 `tests/finish-collision.test.mjs`；既有 `tests/uphill.test.mjs` 的真 `rivalUpdate` 逐位元比對仍通過（補上新區塊的載入）。先失敗：找不到 `@finish-hit` 區塊。
5. 更新紀錄：2026-11-14 那一版 zh／en 各加 3 條。

檢查：LF 無 CR、無 `__lc`、無隱形字元、script 可解析。

### 追加（協調者回饋）
1. **線上衝線後相撞**：`pvpBump` 開頭加 `carsMayCollide(p.oppFt !== null ? o.s : 0, c.loc.s, FINISH_S, state)`，我方已完賽（done）且過終點，或對手已有完賽時間且位置過終點，就不再碰撞；比賽中不變。更新紀錄 zh／en 各加一條。
2. **忙碌提示黏住**：新增 `trackBusyOn`，`lobbyNote` 在忙碌期間把空白與 `onConnecting` 改成 `trackBusy`，其他訊息照常；忙碌結束只清掉 `trackBusy`。
測試：`tests/online-finish-bump.test.mjs`（先失敗三項：對手完賽、我方完賽、忙碌提示被洗掉；之後通過）。`node --test` 共 654 項全部通過。

### 追加（審查後加固）
1. **遲到的計時器**：`makeTrackBudget` 的 `reserve()`（預約）改為 `take()`（只在真的送出時記錄；不能送就回傳要等的毫秒數，不預約）。排隊中的 track 在計時器醒來時重新呼叫 `take()`，額度還沒到就再排一次，所以計時器被壓慢、一次全部醒來也不會在 30 秒內送超過 5 次。
2. **合併重複排隊**：每個頻道用 `sc.tq` 記錄等待中的計時器（排隊或重試），重複 SUBSCRIBED 時直接略過；忙碌狀態用 `sc.busyOn` 平衡，離開頻道或送出後會清掉。
3. **更新紀錄英文**：新增的四行改為 "Fix:" 開頭。
測試（`tests/track-budget.test.mjs`）：先失敗四項（`take` 不存在、遲到、合併），之後 `node --test` 656 項全部通過。

## 驗證與審查紀錄
- 瀏覽器驗證：C2（輸給 AI、贏 AI 都不會在終點後相撞，AI 停在末端時速度為 0，比賽中碰撞照常）、GO（白狼峠大型與預告列各 5 次起跑，沒有一幀同時出現 GO 與提示；重開與線上倒數正常）、B3（倒數與比賽中對手換色不重建，回房間後套用）、E5（模擬房間建立、加入、對戰、離開正常，沒有出現忙碌提示）全部通過，且同樣的檢查在修正前的版本會失敗；回歸腳本沒有退步。最終版本重跑 10 項全部通過。
- 驗證另外發現並一起修正：線上對戰衝線後的碰撞、大廳「請稍候」提示會被蓋掉。保留不改：衝線後兩台車可能互相穿過（比賽已結束，不影響成績）。
- 獨立 code review：可以合併。依審查加固：計時器觸發時重新檢查名額（背景分頁的延遲計時器不會超量）、同一頻道只保留一個排隊中的 track、英文更新紀錄統一用「Fix:」。
- `node --test`：656 個全部通過。
