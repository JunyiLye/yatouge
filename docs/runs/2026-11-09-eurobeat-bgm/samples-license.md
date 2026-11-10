# 取樣授權紀錄

結論：候選 D 用到的所有錄音取樣，都來自同一個作者 Versilian Studios 的兩個 CC0 1.0 資料庫（VCSL 與 VSCO-2-CE）。CC0 允許修改、散布、商用，不需署名。其中 VSCO-2-CE 的 Readme 另外「請求」署名，我們照做，列在最下方。

## 使用的取樣庫

### 1. Versilian Community Sample Library（VCSL）

- 網址：https://github.com/sgossner/VCSL
- 授權：Creative Commons CC0 1.0 Universal（Public Domain Dedication）
- 授權文字：https://github.com/sgossner/VCSL/blob/master/LICENSE （檔案開頭為 "Creative Commons Legal Code / CC0 1.0 Universal"）
- README 原文：「This collection is under a Creative Commons 0 license. Essentially it's Public Domain- you can do whatever you want with these sounds (even make commercial software), no royalties, no credit, no special terms.」
- 是否需要署名：不需要。（仍建議在遊戲說明頁附上下方的致謝行。）
- 取用的檔案（皆為 master 分支，下載時間 2026-11-09）：
  - 鋼琴：`Chordophones/Zithers/Grand Piano, Steinway B/NoSus/JHPiano_NoSus_Close_{E3,G#3,C4,E4,G#4,C5,E5,G#5,C6,E6,G#6,C7}_vl{2,4}_rr1.wav`（12 個音高 × 2 個力度層）
  - 拍手：`Idiophones/Struck Idiophones/Claps/Clap_rr1.wav`、`Clap_rr3.wav`（只用 rr1）
  - 小鼓：`Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v9_rr1_Mid.wav`（另下載 v7_rr1，未使用）
  - 踩鈸：`Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v4_rr1_Mid.wav`、`HiHat_HitC_v3_rr1_Mid.wav`（閉）、`HiHat_HitO_rr1_Mid.wav`（開）

### 2. VSCO 2: Community Edition（VSCO-2-CE）

- 網址：https://github.com/sgossner/VSCO-2-CE
- 授權：CC0 1.0 Universal
- 授權文字：https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE （檔案開頭為 "CC0 1.0 Universal / Statement of Purpose"）
- Readme 原文（Terms）：「You are permitted to use these samples for ANY purpose. We ask that you do not sell the samples directly, and encourage you to keep any work done on improving the sample set open and public. Please provide credit to Versilian Studios/ Sam Gossner, and/or Ivy Audio/Simon Dalzell where applicable, and link to the VSCO: CE homepage.」
- 是否需要署名：法律上不需要（CC0）；作者「請求」署名，所以我們署名。「不要直接販售取樣」也不影響：我們只把取樣裁剪後放在遊戲中使用，不單獨販售。
- 注意：LICENSE（CC0）與 Readme（請求署名、請勿直接販售）的措辭有落差。保守作法是兩者都遵守，這也是我們的做法。
- 取用的檔案：
  - 銅管：`Brass/Trumpet/stac/Sum_SHTrumpet_stac_*_v3_rr1.wav`（11 個音）、`Brass/Tenor Trombone/stac/tenortbn_stac_*_v4_rr1.wav`（7 個音）
  - 大鼓：`VSCO 1 Percussion/drums/bass/bdrum_muted_fff_1.wav`，加上 `VSCO 1 Percussion/drums/snare/drum1/snare1_click.wav` 的點擊聲疊在一起（另下載 bdrum_muted_ff_1，未使用）
  - 吊鈸：`Percussion/cymbal-crash1_ff_rr1.wav`（另下載 mf_rr1，未使用）
  - 管弦樂 hit：兩個庫都沒有現成的，這輪沒有使用。
  - 弦樂：未使用。

## 候選 E 新增的取樣

### 3. VSCO-2-CE 的弦樂與小號（同第 2 節，CC0 1.0，同樣請求署名）

- 網址與授權文字同上：https://github.com/sgossner/VSCO-2-CE ，LICENSE 開頭為 "CC0 1.0 Universal"。
- 取用的檔案（皆為 master 分支，下載時間 2026-11-09）：
  - 小提琴組持續音：`Strings/Violin Section/susVib/VlnEns_susVib_*_v2.wav`（11 個音）
  - 小提琴組跳弓：`Strings/Violin Section/Spic/VlnEns_Spic_*_v2_rr1.wav`（11 個音）
  - 中提琴組持續音：`Strings/Viola Section/susvib/ViolaEns_susvib_*_v1_1.wav`（13 個音，當作弦樂 pad）
  - 大提琴組持續音：`Strings/Cello Section/susvib/susvib_*_v1_1.wav`（13 個音，pad 的根音）
  - 大提琴組撥弦：`Strings/Cello Section/pizzT/pizzT_*_v2_RR1.wav`（13 個音，高八度貝斯的音頭）
  - 低音提琴撥弦：`Strings/Solo Contrabass/Pizz/BKCtbss_Pizz_*_v1_rr1.wav`（14 個音，低八度貝斯的音頭）
  - 小號持續音（帶顫音）：`Brass/Trumpet/susvib/Sum_SHTrumpet_susvib_*_v2_rr1.wav`（11 個音，長音的銅管疊加）
- 找不到可驗證授權的 CC0 電吉他或電貝斯取樣，所以沒有使用。

### 4. Freesound 的 CC0 單檔（逐檔確認授權頁）

兩個檔案都是我在 Freesound 網站用「Creative Commons 0」授權過濾器找到，並開啟個別聲音頁，確認頁面上的授權連結為 http://creativecommons.org/publicdomain/zero/1.0/ （即 CC0 1.0）。下載的是網站公開的 hq 預覽 MP3，沒有登入、也沒有使用 API。

| 用途 | 檔名與頁面 | 授權 | 署名 |
|---|---|---|---|
| 舞曲大鼓 | "909 kICK.WAV" by ZeSoundResearchInc.，https://freesound.org/people/ZeSoundResearchInc./sounds/145775/ ，檔案 145775_2101444-hq.mp3 | Creative Commons 0 | 不需要；仍列在下方致謝 |
| 殘響脈衝響應（真實音樂廳錄音） | "IR Liverpool Philharmonic Hall.wav" by johnnyguitar01，https://freesound.org/people/johnnyguitar01/sounds/423866/ ，檔案 423866_4844309-hq.mp3 | Creative Commons 0 | 不需要；仍列在下方致謝 |

- 另外下載了 "909 Kick 4"（CAT-FOX_ALEX，sounds/871043）、"BIG ROOM KICK [PUNCHY].wav"（xKPL_Klawz，sounds/265328）和 "IR_ST_Hall_04.wav"（Tim_Verberne，sounds/537650），三個也確認是 CC0，但最後沒有採用，也沒有放進 `samples-e/`。
- 預覽 MP3 是 Freesound 重新編碼的版本，不是原始檔。對大鼓與殘響用途影響不大。
- 沒有採用任何 OpenAIR 的 IR：多數是 CC BY-SA 或 CC BY-NC，授權逐檔不同，這輪不使用。

## 署名行（可放在遊戲的說明頁或 README）

> Music samples: Versilian Community Sample Library (VCSL) and VSCO 2: Community Edition, by Versilian Studios / Sam Gossner, CC0 1.0. https://github.com/sgossner/VCSL , https://github.com/sgossner/VSCO-2-CE
> Kick drum "909 kICK.WAV" by ZeSoundResearchInc. and hall impulse response "IR Liverpool Philharmonic Hall.wav" by johnnyguitar01, both CC0, via freesound.org.

## 檢視過但沒有使用的取樣庫

- Salamander Grand Piano v3（Alexander Holm）：https://github.com/sfzinstruments/SalamanderGrandPiano ，授權是 Creative Commons Attribution 3.0（CC BY 3.0），README 的 License 一節確認。授權可接受（需署名），但 VCSL 的 Steinway 已是 CC0，不需要多一個署名義務，所以沒有採用，也沒有下載。
- VCSL 自帶的其他鋼琴（Kawai、Upright）：同為 CC0，音質沒有比對，未採用。
- Freesound 的 CC0 鼓組：沒有採用。個別檔案的授權要逐檔確認，而 VCSL 與 VSCO 已有可用的鼓聲，不必增加風險。

## 處理方式與來源下載位置

- 原始 WAV 在 `docs/runs/2026-11-09-eurobeat-bgm/samples-raw/`（約 93 MB，只下載、不執行，也不隨遊戲發布）。
- 候選 E 的處理後檔案在 `samples-e/`（約 4.16 MB，138 個檔），由 `candidates-src/process2.cjs` 產生；候選 D 的在 `samples/`。
- 處理後的 MP3 與 `manifest.json` 在 `docs/runs/2026-11-09-eurobeat-bgm/samples/`（合計 1.23 MB，50 個檔）：裁切、對音量、立體聲或單聲道、淡出，用 lamejs 編成 MP3。lamejs 只是建置時的編碼工具，不會放進遊戲。
- 處理腳本在 `candidates-src/process.cjs`（轉檔與裁切），下載腳本是 `candidates-src/fetch.cjs`。
