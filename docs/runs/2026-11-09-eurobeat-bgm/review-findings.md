# Code Review Findings — Eurobeat 背景音樂

結論：沒有 Critical，也沒有 Important。審查者確認效果器只會建立一次、音源節點會被回收、循環接縫沒有問題、不會破音、音效與引擎聲沒有被動到，結論為可以上線。另有 5 項 Minor，處置等使用者決定。

審查者：fresh-context code-reviewer subagent（唯讀，沒有開瀏覽器）。`node --test` 95/95（審查當下）。

## Minor
- CR1：同時發聲數上限（40）實際上不會觸發。最壞情況約 20–25 個 oscillator。主執行緒卡住、排程落後時，補排的音符會一次全部發出。建議在 `sched` 開頭加上 `nextT = Math.max(nextT, ac.currentTime + 0.05)`。
- CR2：拍手的三角波與大鼓的 oscillator 沒有被計入上限。
- CR3：關掉音樂後，排程器仍然在合成音符，只是音量為 0，會多耗電。建議關閉時跳過 `playStep`，重新打開時同步 `nextT`。
- CR4：測試只檢查音高在 A 小調內，沒有檢查旋律是否符合當下的和弦；`sweep`、`stab` 的位置沒有測試。
- CR5：1 秒的 reverb 一直在運作，低階手機可能感覺得到負擔。可以縮短為 0.6 秒。
- Disposition: pending

## Dropped on verification
- 無。

## 使用者處置（2026-11-09）
- CR1、CR3、CR5：fix-now，已修正。`node --test` 99/99，瀏覽器 smoke 通過，已上傳為 Version 23。
- CR2、CR4：不處理。
