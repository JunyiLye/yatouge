# GitHub Pages 版線上對戰（Supabase Realtime）— 規格與實作計畫

結論：讓 GitHub Pages 上的遊戲（https://junyilye.github.io/yatouge/）也能線上 1 對 1 對戰。連線改經過使用者的 Supabase 專案的 Realtime，提供兩種房間：
- 大廳列出公開房間，任何人都能加入；
- 私人房間不列在大廳，只能用 4 碼代碼加入。

claude.ai 版維持原本的 room 能力（只限組織成員），兩邊的大廳各自獨立。遊戲本身的對戰邏輯（暱稱、同步倒數、插值、碰撞、勝負）全部沿用，只多一個傳輸層。

Pipeline：Frontend Feature SDD — 完整流程。有對外連線和公開網路的資料，屬於安全面。使用者已直接指定方案與房間規則，視為 Design Gate 決策。

## 使用者決定（2026-11-12）
- 後端：Supabase Realtime。專案 URL 為 `https://kvalgehfazubficybqhw.supabase.co`，publishable key 為 `sb_publishable_dAQEl29T_VoG_SaKb4jzsg_AppMoOJw`。這把 key 本來就是公開用的，可以放進前端。
- 房間：公開房間加上私人代碼房間。
- claude.ai 版不改，兩個大廳分開。

## 設計
1. **選擇傳輸層**：
   - 在 claude.ai 內（`claude.use('room')` 可用）→ 用現有的 room。
   - 在 localhost 且帶 `?mockroom=1` → 用 mock。
   - 其他情況（GitHub Pages 或任何網域）→ 用 Supabase。
   - Supabase 連不上 → 線上按鈕顯示「線上暫時無法使用 (原因)」，不影響單人模式。
2. **Supabase 傳輸層轉接器**：
   - 對外提供與現有 room 相同的介面：`presence`、`peers`、`onPeers`、`join(name)`、`connected`、`onConnection`、`leave`，以及 `peer` 與 `isMe`；`by` 一律為 null。
   - supabase-js 從 CDN 載入固定版本，例如 `@supabase/supabase-js@2.x.y`（指定確切版本），只在需要時才載入。
   - **大廳**：一個公開 channel（例如 `yatouge-lobby`），只放大廳的 presence（開房廣告）。
   - **對戰房**：每間房一個 channel（`yatouge-room-<name>`）。
   - **頻率**：Supabase 的 presence 不適合每秒 30 次。低頻狀態（`st`、`go`、`trk`、`car`、`col`、`nk`、`ft`、`opp`）用 `channel.track()` 送，並節流約每秒 2 到 4 次。車子狀態 `c` 與序號 `n` 用 broadcast 送，約每秒 20 次。接收端把兩者合併成同一個 peer 物件，交給現有的 netcode。
   - `peer` 標籤用每個分頁隨機產生的 id，作為 presence key。
   - 斷線偵測沿用現有的寬限與重連邏輯。
3. **公開房間與私人房間**：
   - 大廳的「建立房間」改成兩個選項：「公開房間」與「私人房間」。
   - 私人房間產生 4 碼代碼（大寫英數，排除易混淆的字元），不在大廳廣告，房間 channel 名稱由代碼推導。
   - 大廳增加「輸入代碼加入」欄位。
   - 房內顯示代碼，方便告訴朋友。代碼的格式要驗證。
4. **安全與濫用**：
   - 所有收到的資料沿用現有的驗證（`validatePeerState`、`cleanNick`、白名單）。
   - 大廳列表限制最多 30 間房。
   - 不在任何地方顯示 IP 或帳號。
   - 不使用資料庫，只用 Realtime，所以沒有資料會被存下來。
   - 送出頻率有上限。
5. **可用性**：
   - 線上按鈕的狀態列沿用 `onlineStatus` 的設計。在 Pages 上狀態依序為「連線中…」、啟用，或「線上暫時無法使用 (原因)」。
   - 手機橫向版面也要能正常操作大廳、代碼輸入與房間。

## Exit Criteria
1. 從專案根目錄執行 `node --test` 全部通過，0 個失敗。新增的純函式先寫測試，先紅後綠：
   - 代碼產生與驗證；
   - presence 與 broadcast 合併成同一個 peer；
   - 傳輸層選擇規則；
   - 節流。
2. 用真實的 Supabase 專案，在本機（127.0.0.1）開兩個不同的瀏覽器 context 實測：
   - 公開房間：建立、大廳列出、加入；
   - 私人房間：用代碼加入，而且大廳看不到這間房；
   - 同步倒數，雙方開跑時間差 < 0.3 秒；
   - 互相看得到對方的車在動、碰撞、勝負都正確；
   - 中途斷線與離開的處理正確；
   - console 沒有錯誤。
3. claude.ai 路徑沒有改變：mock 雙分頁的對戰正常，room 的狀態列正常。
4. 單人模式完全不受影響，Supabase 只在按下線上按鈕時才載入。
5. 推送到 GitHub 之後，在 https://junyilye.github.io/yatouge/ 實際開兩個瀏覽器 context 對戰一次（maker 或 verifier 執行）。
6. 測試結束時關閉所有測試 server 與瀏覽器。

## 未解問題與假設
- **Supabase 專案的 Realtime 設定**：若專案開啟了「只允許私人 channel」（Realtime 設定中的 private channels only），公開 channel 會被拒絕。這種情況需要使用者在 Supabase 後台關閉該設定，或改成使用 RLS 授權。maker 遇到時要回報，不要自行處理。
- **免費方案的連線數與訊息量上限**：休閒對戰應該足夠。若超過上限，會顯示「線上暫時無法使用」。
