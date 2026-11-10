# 背景音樂改為 Eurobeat — 實作計畫

結論：移除現有的背景音樂，換成一首原創、Initial D 風格的 Eurobeat 曲子。音樂仍由 Web Audio 即時合成，不加任何音檔。曲子有完整段落（前奏、主歌、導歌、副歌、前奏 riff 回歸），整首循環播放。旋律是原創的，不抄任何既有歌曲。

Pipeline：Frontend Feature SDD — Light Path（單一檔案、無 API、無新相依）。

## 使用者需求（2026-11-09 原話）
「make the bgm sounds like eurobeat remove the current one, i want the bgm sounds like initial d like eurobeats!!」

**假設**：「像 Initial D」指的是曲風，不是重現某一首歌。重現實際歌曲的旋律有著作權問題，所以全部旋律、riff 都要原創。狀態：已在回覆中告知使用者。

## 第二輪：重做（2026-11-09，使用者回饋）

使用者聽了第一版之後說「i dont like the eurobeat song at all!」，並指出三個問題：**聲音廉價、單薄**；**旋律不好記**；**不夠有衝勁**。使用者選擇繼續做 Eurobeat，但要重做。

做法：先試聽，確認後才上線。
1. **先做兩個候選版本**（A、B）。兩者的 hook 與 riff 不同，聲音設計都升級。各匯出約 40 秒的 WAV，內容從 riff 開始，經過導歌，進入副歌，給使用者挑。使用者選定之前不上傳。
2. **聲音升級**：
   - **supersaw**：7 個鋸齒波，detune 較寬（約 ±25 cent），疊一層高八度，左右展開更寬。另外加一層方波或脈衝波增加厚度，以及輕微的 chorus 或調變。
   - **大鼓**：分三層，click（點擊聲）、body（下沉的正弦波）、輕微失真（WaveShaper）。
   - **小鼓或拍手**：noise 加上 body，送一點 reverb。
   - **貝斯**：兩層，加 WaveShaper 飽和，讓它更有咬勁。
   - **鼓組**：hi-hat 更亮；每個段落開頭有 crash；段落轉換前有鼓 fill。
   - **主輸出**：EQ（低切與高頻 shelf）、glue compressor，最後加 limiter（ceiling 約 −1 dBFS）。整體響度比第一版高約 3–5 dB，但不能破音。
   - **側鍊**：壓得更深、更明顯，大約壓到 0.15。
3. **旋律**：
   - Eurobeat 的 hook 是快速、有切分音的 16 分音符樂句，有大跳音程和問答句，帶有英雄式的悲壯感。和弦常用 i–VI–VII–i，以及往上推的 VI–VII。
   - riff 要有一個重複的動機（motif），聽兩次就能哼出來。
   - **最後一輪副歌升 Key**（全音），這是 Eurobeat 的招牌手法。
4. **衝勁**：
   - BPM 提高到約 162。
   - 16 分音符的 arp 貫穿整首（主歌音量較小）。
   - 導歌加入 riser 與小鼓連打；副歌前有一拍空白（break），讓副歌爆開。
5. 仍然全部原創，不抄任何既有歌曲。
6. 第一輪的測試 (a)–(h) 以及 `schedRun` 的測試，依新曲調整後仍要成立。升 Key 段落的音階檢查改為以該段的調性為準。

## 現況
- 約 1183–1270 行：`initAudio` 建立 `musicGain`（0.32），接著呼叫 `startMusic`。
- `sched` 每 25 ms 往前排程 0.15 秒，`playStep` 每個 16 分音符呼叫一次。
- 現有素材：`tone`、`noise`、`kick`、BPM 156，曲子是 4 小節進行加旋律。
- `setMusic(on)`、M 鍵和 `#btnMusic` 控制開關。這些介面不變。

## Eurobeat 的特徵（設計依據）
- BPM 約 158，4/4 拍，四拍都有大鼓（four-on-the-floor）。
- 貝斯是招牌的「八度跳躍」：反拍上低八度、高八度交替的八分音符，例如「根音低八度 → 根音」不停彈跳。
- 第 2、4 拍有拍手加小鼓，反拍有開放 hi-hat，16 分音符有閉合 hi-hat。
- 主旋律用 supersaw：多個鋸齒波彼此微微走音（detune）疊在一起，聲音很亮、很寬。
- 段落轉換時有銅管或管弦樂的重音（stab、orchestra hit）。
- 和弦是小調的戲劇性進行，例如 i–VI–VII–i 或 vi–IV–V–iii。
- 導歌段落用小鼓連打（snare roll）加濾波器掃頻往上推，副歌爆開。
- 有一段很好記的前奏 riff（synth 或銅管），會在曲中重複出現。

## 設計
1. **純函式區塊** `/* @eurobeat:start */ … /* @eurobeat:end */`（不依賴 Web Audio、DOM）：
   - `EURO` 常數：BPM 158；調性為 A 小調（可改）；`SECTIONS` 列出段落順序與每段的小節數；每段的和弦進行；前奏 riff、主歌、副歌的旋律資料。旋律以 `[16 分音符位置, MIDI 音高, 長度]` 表示。
   - `stepEvents(step)`：給定從頭算起的第幾個 16 分音符，回傳該步要發出的事件陣列，例如 `{ inst: 'kick' }`、`{ inst: 'bass', midi, len }`、`{ inst: 'lead', midi, len }`、`{ inst: 'stab', notes }`、`{ inst: 'clap' }`、`{ inst: 'hatO' }`、`{ inst: 'hatC' }`、`{ inst: 'arp', midi }`、`{ inst: 'pad', notes }`、`{ inst: 'roll', vel }`、`{ inst: 'sweep', … }` 等。
   - 整首長度 = 所有段落的小節數 × 16 步，超過就循環。
   - 段落建議，總長約 1.5–2 分鐘：
     - intro：riff，8 小節；
     - verse：16 小節；
     - pre-chorus：8 小節，最後 1 小節小鼓連打加掃頻；
     - chorus：16 小節；
     - riff 回歸：8 小節；
     - 然後循環。
   - 主歌只有輕的 arp，鼓組完整；副歌加上 supersaw 主旋律與銅管 stab。
2. **音色**，接在 `musicGain`：
   - kick：短、有力，沿用或加強現有的。
   - 八度貝斯：鋸齒波加低通濾波，有一點 pluck 感。
   - supersaw 主旋律：5 個鋸齒波，detune 約 ±7–20 cent，聲像左右展開（`StereoPannerNode`）。
   - 銅管 stab：鋸齒波加快速關閉的濾波包絡。
   - 16 分音符 arp：方波或鋸齒波，音量小。
   - pad：三角波或鋸齒波，加慢 attack。
   - 鼓組：拍手和小鼓用 bandpass noise，hi-hat 用 highpass noise。
   - **側鍊壓縮（sidechain）感**：每個大鼓時，把非鼓組 bus 的音量短暫壓低後再回升，這是 Eurobeat 的「抽吸」感。
   - **空間感**：一條 feedback delay（約 3/16 拍，feedback 約 0.25），送給主旋律和 stab。可以加一個小的 ConvolverNode reverb，用生成的 impulse 雜訊，不載入檔案。
3. **效能**：
   - 每一步同時發聲數要有上限。supersaw 只在副歌和 riff 段落出現。
   - 節點用完就 stop，讓它被回收。
   - 不新增計時器：沿用 `sched` 和 `setInterval(25ms)` 的排程。
4. **移除舊曲**：刪掉 `PROG`、`ARP`、`MEL`、舊的 `playStep` 內容，以及只有舊曲使用的常數。`tone`、`noise`、`kick`、`env` 如果新曲沒有用到就刪除，有用到就保留。
5. **不變**：
   - 音樂開關（`setMusic`、M 鍵、按鈕）和 `musicGain` 預設音量。
   - 引擎聲、甩尾聲、撞擊聲、水溝噪音。
   - 主畫面也播同一首。

## 任務
1. **純函式層**：先寫測試，再實作。
   - (a) 每拍（每 4 步）都有大鼓，整首都是。
   - (b) 主歌與副歌中，貝斯都落在反拍，高低八度交替：同一個和弦內，相鄰兩個貝斯音相差 12 半音。
   - (c) 第 2、4 拍有拍手或小鼓。
   - (d) 所有旋律、riff、和弦的音都在調性的音階內（A 小調自然或和聲小調）。
   - (e) 副歌有 lead 事件，主歌沒有 supersaw lead。
   - (f) 導歌的最後一小節有小鼓連打。
   - (g) 整首長度等於各段落小節數總和 × 16，超過後從頭循環：`stepEvents(total + k)` 和 `stepEvents(k)` 相同。
   - (h) 每一步的事件數不超過上限，例如 12。
2. **音色與接線**：接進 `sched`。這部分沒有純邏輯可測，由瀏覽器驗證。

既有的測試都要維持通過。

## Exit Criteria
1. 從專案根目錄執行 `node --test` 全部通過，0 個失敗。
2. 任務 1 的 (a)–(h) 先紅後綠。
3. 瀏覽器實測：
   - 開始遊戲後音樂會播放，console 沒有錯誤。
   - 用 `OfflineAudioContext`，或在頁面上錄 `ac` 的輸出約 20 秒（例如接 `MediaRecorder` 或 `AnalyserNode`），確認有聲音輸出，而且在每拍出現能量峰值（四拍大鼓）。
   - 音樂開關可以把聲音關掉、打開。
   - 播放 2 分鐘以上，節點數不會一直增加：比較開始與結束時的 `performance.memory`，或抽查排程中的 node 數量。
4. 舊曲的程式碼已移除（grep `PROG`、`MEL` 為 0）。
5. Build / lint：N/A。
6. 試聽：無法自動判斷「像不像 Eurobeat」。由 maker 匯出一段約 30 秒的 WAV（OfflineAudioContext 渲染）到本資料夾，讓使用者可以直接聽。

## 環境說明
- 本資料夾不是 git repo。改動前把 `yatouge.html` 備份到本資料夾的 `yatouge.before.html`。
- 鏡頭模式（`2026-11-09-camera-modes`）完成後才開始，避免兩個人同時改同一個檔案。
- 在 Windows 上關 server 時，用 `netstat -ano` 找出真正的 PID，再用 `taskkill /PID`，只關自己開的那個。
