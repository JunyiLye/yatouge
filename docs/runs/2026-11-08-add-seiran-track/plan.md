# 新增第二條賽道「青嵐峠」— 實作計畫

結論：在 `yatouge.html` 加入第二條賽道，路線依使用者提供的手繪路線圖（`route-source.png`）描出；原本的黑鷺山賽道保留不變。主畫面新增賽道選擇，選擇會被記住，個人最佳成績依賽道分開記錄。

Pipeline：Frontend Feature SDD — Light Path（無 API、單一檔案、無新相依、無安全面）。

## 已確認的決定（使用者 2026-11-08 回答）

- 比例：每像素 3 公尺。
- 方向：從圖左下角的尾端出發，終點在圖右上方的末端。

## 路線資料（已在規劃階段產出）

- `waypoints.json`：330 個路點，單位為「圖片像素」，以起點為原點，`[px, py]`，x 向右、y 向下。
- 產生方式（`tools/`，可重現）：`trace.js` 把圖上的雙線外框膨脹 1px 後細線化（Zhang-Suen），以 BFS 取兩端點間最短骨架路徑；`waypoints.js 4 5` 做移動平均並每 5px 取一點；`relax.js 11` 只在曲率半徑小於 11 m 的地方做局部平滑（最大位移 5.6 m，約 2px，肉眼與原圖重疊）。
- 依遊戲相同演算法（Catmull-Rom → 每 1.5 m 重取樣）實測：全長約 5,217 m、約 3,479 個點、最小彎道半徑約 11.3 m、不相鄰路段中心線最小間距約 22.6 m、約 11 個髮夾彎（同方向連續轉向 ≥ 150°）。

## 設計

1. **座標換算**：世界座標 `x = -px * 3`、`z = -py * 3`。遊戲中前進方向為 `(sin h, cos h)`、右方為 `(-cos h, sin h)`，從上方看 +z 朝上時右方是 -x，所以 x 取負號，左右彎才會和圖一致（不會鏡像）。
2. **賽道定義**：新增 `TRACKS` 物件，各賽道有 `id`、名稱（zh/en）、起點門牌文字、取得中心線點的方式。黑鷺山沿用現有 `plan`（S/A/tri）段落定義，產出的 `pts` 必須與現在完全相同；青嵐峠用路點 → Catmull-Rom（均勻參數，端點重複）→ 每 `DS` 重取樣，`h = atan2(dx, dz)`，`k = wrap(h[i] - h[i-1]) / ds`，符號慣例與現有 `k` 相同。
3. **純幾何區塊**：把「由賽道定義算出 `pts`（x, z, h, s, k, ks, y）與髮夾彎數」的程式寫成不依賴 THREE / DOM 的函式，並用註解標記 `/* @course-geometry:start */` … `/* @course-geometry:end */` 包起來，讓 Node 測試能抽出來直接執行。高度公式兩條賽道共用現有的 `230 - s*0.062 + 2.5*sin(s/70)`。
4. **髮夾彎數**：黑鷺山維持現有定義（plan 裡 |deg| ≥ 180 的段數 = 6）；青嵐峠用幾何偵測（|k| > 0.01 的同號連續段累積轉角 ≥ 150°）。
5. **切換賽道時重建場景**：`pts / N / TOTAL / FINISH_I / FINISH_S / hairpins` 與樹木用的空間雜湊改成 `let`，由 `buildTrack(id)` 重新指定。所有與賽道相關的物件（路面、草地、護欄、護欄柱、樹、路燈、起終點門、遠山、地面）放進一個 `trackGroup`；重建時移除並 dispose 其中的 geometry 與非共用 material（共用貼圖如 `roadTex`、`grassTex`、`glowTex` 不要 dispose）。星空與月亮不屬於賽道，不重建。
6. **遠山與地面**：現在遠山距中心 650–900 m，青嵐峠範圍約 1.2 × 1.4 km，會壓在賽道上。改成距離 = 賽道外接半徑 + 250 + rand*250，黑鷺山的外觀可以略有不同，但山不得落在任何賽道上。
7. **主畫面 UI**：在「選擇你的車」上方加一組賽道選擇（`role="radiogroup"`，按鈕 `role="radio"` + `aria-checked`，沿用 `.carcard` 樣式），每張卡顯示名稱與「X.X km · N 個髮夾彎」。選擇存在 `localStorage` 的 `yatouge-track`（沿用 `store` 包裝），預設黑鷺山。切換時呼叫 `buildTrack`、`resetRace`、更新 `#courseInfo`。只有在 `state === 'title'` 時能切換。
8. **文案**：`course` 改為帶賽道名稱參數；`lead` 裡的「黑鷺山 / Mt. Kurosagi」改成目前賽道名稱。新增 i18n 字串 `pickTrack`（選擇賽道 / Choose a course）、`pickTrackAria`。青嵐峠英文名 `Seiran Pass`。起點門牌：`青嵐峠 下坡起點 · START`。
9. **個人最佳**：黑鷺山沿用 `yatouge-best`（保留玩家既有紀錄），其他賽道用 `yatouge-best-<id>`。

## 任務

1. **建立測試環境**：新增 `tests/track.test.mjs`（Node 內建 `node:test`，不加相依），讀取 `yatouge.html`，抽出 `@course-geometry` 區塊並執行。執行方式 `node --test tests/`。實作前執行必須失敗（找不到區塊）。
2. **抽出純幾何並保留黑鷺山**：測試先寫：黑鷺山的點數、`TOTAL`、首尾座標與髮夾彎數 6，必須等於改動前的值（改動前先用目前程式算出基準值寫進測試）。再重構成 `TRACKS` + 幾何函式，測試轉綠。
3. **加入青嵐峠幾何**：測試先寫：(a) 全長 5,000–5,500 m；(b) 起點的下一段方向朝圖上「往上偏右」（由路點前幾點換算）；(c) 平滑後最小彎道半徑（用 `ks`）≥ 10 m；(d) 沿路距離相隔 > 60 m 的點，中心線距離 ≥ 2*HW + 8 m（不重疊）；(e) 髮夾彎數 8–14；(f) 相鄰點間距約為 DS（1.5 m ± 0.05），`h` 連續（相鄰差 < 0.2 rad）。再把 `waypoints.json` 內嵌進去並實作，測試轉綠。
4. **場景重建 `buildTrack(id)`**：測試先寫（可在幾何區塊內提供「賽道外接半徑」等純函式供測試）：遠山距離函式給出的最小距離 > 賽道上任一點到中心的距離 + 150 m。再實作 `trackGroup` 重建與 dispose。
5. **主畫面賽道選擇、文案、各賽道個人最佳**：測試先寫：個人最佳 key 函式對黑鷺山回傳 `yatouge-best`、對青嵐峠回傳 `yatouge-best-seiran`（放在幾何區塊或另一個標記區塊）。再實作 UI。

## Exit Criteria

1. `node --test tests/` 全部通過，0 個失敗。
2. 任務 1–5 中每個寫程式的任務都有對應的持久化測試，且該測試在實作前失敗、實作後通過（Maker 的回報要附上紅燈與綠燈的輸出）。
3. 在瀏覽器開啟 `yatouge.html`，Console 沒有錯誤（Playwright console log 為證）。
4. 主畫面可選兩條賽道，重新整理後保留選擇；`#courseInfo` 顯示對應長度與髮夾彎數。
5. 選黑鷺山開跑，起點門、車輛位置、外觀與改動前相同（與改動前截圖比對）。
6. 選青嵐峠開跑：倒數後可以開車，對手車會沿路前進，HUD 進度條隨距離前進；俯視截圖的路線形狀與 `route-source.png` 一致且未鏡像。
7. 青嵐峠跑完（可用測試捷徑把車移到終點附近）會出現結果畫面，個人最佳寫入 `yatouge-best-seiran`，不覆蓋 `yatouge-best`。
8. Build / lint：本專案為單一 HTML，無 build 與 lint 工具，標記 N/A。

## 環境與其他說明

- 本資料夾不是 git repo：無法開工作分支、無法 checkpoint commit，也沒有 git diff 可給 reviewer。改動前先把 `yatouge.html` 備份為 `docs/runs/2026-11-08-add-seiran-track/yatouge.before.html`，作為比對基準。
- 無 API，不需要環境 fallback 決策。

## 未解問題與假設

- **最小彎道半徑約 11 m，不是先前估計的 13–15 m**。依據：以 3 m/px 實測描線結果。影響：最窄的幾個髮夾彎比原估計更窄，需要更慢、更早拉手煞。若答案不同：把比例改成約 3.5 m/px 可達 13 m 左右，全長約 6 km（改一個常數）。給使用者的問題：維持 3 m/px 或放大？狀態：open。
- **賽道名稱「青嵐峠 / Seiran Pass」由我暫定**。若使用者要別的名稱，只改字串。狀態：open。
