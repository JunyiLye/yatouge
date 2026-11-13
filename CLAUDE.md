# 夜峠下坡（yatouge）— 給新工作階段的 Playbook

這份文件讓新的 Claude 工作階段快速了解這個專案是怎麼做出來的、怎麼改、怎麼驗證、怎麼發布。程式碼與既有文件是真相來源；本文件與程式碼不一致時，以程式碼為準並順手更新本文件。

## 一、專案是什麼
- `yatouge.html` 是整個遊戲：單一 HTML 檔、three.js r128（從 cdnjs 載入），約 6000 行，沒有建置步驟。
- 夜間山路下坡甩尾賽車：三條賽道、三台車、單人對 AI、計時賽（幽靈車）、送酒模式、線上 1 對 1（含觀戰、聊天、貓捉老鼠）。
- `index.html` 只是轉址到 `yatouge.html`，給 GitHub Pages 用。
- `README.md` 是給玩家看的說明（zh-TW）。
- `tests/` 是 `node:test` 單元測試；`docs/runs/<日期>-<主題>/` 是每次工作的計畫與紀錄。

## 二、發布方式（重要）
- **只推到 GitHub**：https://github.com/JunyiLye/yatouge（branch `main`，公開）。GitHub Pages 自動更新：https://junyilye.github.io/yatouge/
- claude.ai artifact 已在 2026-11-13 依使用者要求刪除，**不要再發布 artifact**。程式中 claude.ai `room` 的傳輸碼仍保留，但已不使用。
- 慣例是直接在 `main` 上 commit 並 push（這個 repo 的 git log 都是這樣）。
- Commit 格式：`<type>: <subject>`（feat / fix / docs …），內文用條列，結尾加上 attribution 行。Commit email 用 repo 既有的設定。
- 每次改動驗證完就 push；使用者會在 Pages 上直接玩。

## 三、程式結構
### 純函式區塊（可測試）
需要測試的邏輯寫在標記區塊裡：

```js
/* @name:start */
...純函式與常數，不碰 DOM、不碰 three.js 場景...
/* @name:end */
```

測試用正規表示式切出區塊，再用 `new Function` 載入（範例見 `tests/kx-chime.test.mjs`）。現有區塊：

| 類別 | 區塊 |
|---|---|
| 賽道與物理 | `course-geometry`（含 `lerpAngle`）、`gutter`、`engine`（`ACCEL_SCALE` 2/3）、`gearbox`（手排、換檔煞車、引擎煞車）、`collision`、`vehicle`、`drift-follow` |
| 車輛外觀 | `cars`（`CARS`、`rivalFor`）、`lettering`、`cabin-shape`（`CAB`：外觀與車內共用的車艙資料）、`dispose` |
| 車內視角 | `cockpit`（`COCKPIT_CARS`）、`lean`（慣性前傾）、`camera-modes` |
| 模式 | `timeattack`（幽靈車壓縮）、`sake`（送酒模式）、`kx-chime` |
| 線上 | `netcode`、`supa`、`onlinestatus`、`spectate`、`roompick`（房間投票）、`catmouse`、`chat` |
| 輸入與介面 | `keybind`、`gamepad`（含震動 `shiftBuzz`）、`touch`、`tilt`、`tapguard`、`ingame-menu`、`own-music`、`turbo-sfx` |

### 車輛模型
- `makeCar` 依車型分支建模：`hatch`（KX-2，AE86 風格，白色版本用於送酒模式）、`coupe`（SR-7，FD 風格）、`gtr`（GT-32，R32 風格）。
- 車身多半用斷面 loft（`loftBody`，SR-7 另有 `fdHalf` 斷面與 `fdCabin` 車艙），輪拱用 shader discard 切圓洞再加深色內襯，貼花用 `CanvasTexture` 或 `wrapDecal`（以 raycast 貼在車身表面）。
- 共用材質與貼圖不能被 `disposeTree` 釋放（傳入 `shared` 集合）。
- 車名、標誌、車牌一律虛構：**不得出現真實品牌、車名或標誌**（NISSAN、MAZDA、GT-R、RX-7 等），車牌不放文字。
- 車內視角用另一套車內模型（外觀在車內視角時隱藏）。KX-2、GT-32、SR-7 的車內窗框、A 柱、引擎蓋都由 `CAB` 的同一組數字產生，與外觀對齊。

### 線上對戰
- GitHub Pages 上的傳輸層是 Supabase Realtime（URL 與 publishable key 寫在 `SUPA`，publishable key 本來就是公開給瀏覽器用的）。不使用資料表，不存任何資料。
- **Supabase 每個 client 每 30 秒只能呼叫 presence 5 次**：presence 只當名單，所有遊戲狀態、投票、聊天都走 broadcast。
- 房間協定版本 `v: 2`，舊版 client 會被拒絕。只顯示暱稱，不使用任何帳號資訊。
- `?mockroom=1` 是只在 localhost 運作的雙分頁模擬，測試用。

### 本機儲存
所有設定存在 localStorage，key 以 `yatouge-` 開頭（例如 `yatouge-car`、`yatouge-track`、`yatouge-trans`、`yatouge-keys`、`yatouge-vibe`、`yatouge-ta-best-<track>-<car>`、`yatouge-sake-best`）。新增 key 時沿用這個前綴，讀取時要能容忍壞掉的資料。

## 四、改動流程
1. 先讀相關區塊與既有測試（Constitution：先讀再寫）。
2. 在 `docs/runs/<日期>-<主題>/plan.md` 寫計畫（zh-TW），列出使用者的決定與 Exit Criteria。
3. TDD：先寫或改 `tests/*.test.mjs`，看它失敗，再實作。
4. 從**專案根目錄**執行 `node --test`（不要在 `tests/` 裡執行），必須全部通過。
5. 視覺改動要拍修改前後的照片自己看（見第五節）；車型改動要與使用者提供的照片並排比對。
6. 檢查：
   - 換行只能是 LF：`tr -cd '\r' < yatouge.html | wc -c` 必須是 0（`.gitattributes` 強制 LF，測試依賴它）。
   - 不能留下除錯掛鉤：`grep -c "__lc" yatouge.html` 必須是 0。
   - Edit/Write/Bash 工具可能把 `\uXXXX` 跳脫字元變成真正的字元（U+2028、零寬、bidi），會讓正規表示式壞掉。寫完要檢查沒有這類隱形字元，並確認 script 可以被解析。
7. Commit、push。

## 五、瀏覽器測試（硬性規定）
使用者的電腦（16 GB）曾因兩個 agent 同時跑 headless Chromium 而當機兩次。規定：
- **同一時間只跑一個 builder（subagent）**，不平行。
- **最多一個 headless 瀏覽器、一個分頁**；多人情境用同一個瀏覽器的多個分頁（最多兩個），並模擬傳輸層，**不連真正的 Supabase**。
- **在啟動瀏覽器的腳本內**檢查記憶體：`os.freemem()` 低於 3.5 GB 就不啟動。一次啟動拍完所有角度。
- 能用 node 測試就不開瀏覽器。
- 結束時關閉所有瀏覽器與 server，並確認：
  `Get-CimInstance Win32_Process -Filter "Name='chrome-headless-shell.exe'"` 的數量是 0。
- 使用者不希望同事發現：**所有測試用的 server 與瀏覽器用完一定要關**。使用者自己在 4200、4210、4300 port 的 dev server 不是我們的，不要動。
- 不要用 `git stash` 或任何會改動工作目錄、index 的 git 指令（會影響同時在跑的工作）。

本機 headless 環境：
- playwright-core：`C:/Users/M00/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core`
- 瀏覽器：`C:/Users/M00/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe`（要指定 `executablePath`，預設會找不存在的 1254 版）

做法：用 node 內建 http server 提供一份**暫存副本**，在最後的 `})();` 前注入 `window.__lc = c => eval(c);`，再用 `page.evaluate(() => window.__lc("..."))` 操作遊戲內部狀態（例如覆寫 `updateCamera` 拍特寫、`choice = { car: 'gtr', color: 0 }; buildCars();` 換車）。**除錯掛鉤只能放在暫存副本，絕不能進 `yatouge.html`。**

```js
const html = fs.readFileSync('yatouge.html', 'utf8')
  .replace(/\}\)\(\);\s*<\/script>\s*$/m, 'window.__lc = c => eval(c);\n})();\n</script>');
// http.createServer 回傳 html → chromium.launch({ headless: true, executablePath: EXE }) → 拍照 → finally 關閉 browser 與 server
```

## 六、使用者偏好與既有決定
- 回覆與文件用繁體中文（台灣用語）；程式碼註解跟隨檔案既有慣例。
- **新增設定或開關時，不能改變原功能的聲音、外觀或時間**（例如 KX-2 時速警示音必須維持原本的鈴聲：2093/1661 Hz，超過 100 km/h，每 0.9 秒）。
- 操控手感的改動要小、一次一項，並請使用者試玩；單元測試的模擬預測不了手感（甩尾鏡頭與防打滑曾因此被退回）。
- 不放有版權的音樂（`goldenage.mp3` 永遠不能發布）；不使用頭文字 D 的名稱或品牌（送酒模式取代了原本的豆腐點子）。
- 車型修改要依使用者照片做準確，不要只修細節：先量照片比例，再用相同角度並排比對，自己看過才推送。
- 驗證要短；長時間工作要定期回報進度。
- 回覆時不說「完成、修好」除非已經驗證；沒驗證的部分直接講沒驗證。

## 七、快速對照
- 執行測試：`node --test`（根目錄）
- 推送：`git push origin main`（Pages 約一分鐘後更新）
- 過去每次工作的計畫與決定：`docs/runs/`（只有 `.md` 會進 git，截圖等其他檔案被 `.gitignore` 排除）
