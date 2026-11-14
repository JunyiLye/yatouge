# 深度檢查 A：畫面、設定、中英文字串（yatouge.html 1–1195、6344–6557，main 7d36d13）

## A1（重要）主畫面大多數控制項按 Enter 會直接開始單人比賽，而不是觸發該控制項
- 位置：處理在 `yatouge.html:5994`；靜態 HTML 468、499-509、521。
- 原因：主畫面按 Enter 會 `preventDefault()` 並執行 `askTrans(startRace)`，只排除 `.music, #tKx, #tTa, #tKeys, #tLog`。受影響：線上對戰、語言、震動、彎道提示選單、操作設定、模式／賽道／方向／車／顏色卡片。
- 重現：Tab 到「線上對戰」按 Enter，跳出單人比賽的變速箱選擇。
- 預期：Enter 只在焦點不在互動控制項上（或在開始按鈕）時當作開始。
- 信心：依閱讀（瀏覽器標準行為）。與 E4 為同一個問題。

## A2（重要）Ctrl 或 Alt 可以綁成降檔、鏡頭、聊天，但綁了之後永遠不會觸發
- 位置：`yatouge.html:778`（`KB.FIXED_KEYS` 只擋 Meta）、810-825（`kbSetKey`）；過濾在 5989（降檔）、5993（鏡頭）、5985 與 `chatKey` 的 mod（聊天）。
- 原因：遊戲只在 `!e.ctrlKey && !e.metaKey && !e.altKey` 時處理，而 Ctrl 自己的 keydown 帶有 `ctrlKey === true`。
- 重現（node）：`kbSetKey(..., 'shiftDown', 0, 'ControlLeft')` → set；5989 的條件對 `{code:'ControlLeft', ctrlKey:true}` 為 false。
- 預期：按鍵頁拒絕 Control／Alt，或處理時忽略「本身就是修飾鍵」的旗標。
- 信心：綁定端已重現；事件旗標依規格閱讀。

## A3（輕微）送酒模式中，選單的鏡頭欄顯示存檔的模式，而不是強制的車內視角
- 位置：`yatouge.html:6357`。預期顯示 `camNow()`。信心：依閱讀。

## A4（輕微）在遊戲內選單切換語言後，主畫面的線上狀態文字仍是舊語言
- 位置：`yatouge.html:6410`（`#igLang` 只呼叫 `applyLang()`，`#langBtn` 另外呼叫 `renderOnline()`）。預期一起呼叫 `renderOnline()`。信心：依閱讀。

## A5（輕微）選完模式、賽道、方向、車、顏色後，鍵盤焦點不見
- 位置：重繪在 4534-4637。原因：重繪用 `innerHTML=''`，焦點掉回 body；手把路徑有補回，鍵盤沒有。預期：重繪後把焦點放回同一位置的新按鈕。信心：依閱讀。

## A6（輕微）存檔的語言若是 `toString`、`constructor`、`__proto__`，所有文字壞掉，還可能讓程式停住
- 位置：`yatouge.html:1161-1162`（`if (!I18N[lang])` 接受繼承屬性）。
- 重現（node）：`"toString"` → T() 回傳 undefined；更新紀錄自動跳出時 `clRender` 會丟 TypeError，`requestAnimationFrame(frame)` 不會執行。
- 預期：用 `Object.hasOwn(I18N, lang)`。信心：重現＋閱讀；只有被竄改的存檔會觸發。

## 檢查過、沒發現問題
中英文字串 key 完全對應；靜態 HTML 沒有重複 id 或指向不存在元素的 aria／for；中文沒有中國用語；`taAt` 遇到空幽靈車的情況不會發生（`taDecode` 回傳 null、`placeGhost`／`taDelta` 都有處理）。
