# screenstudio-agent

用命令列操控 [Screen Studio](https://www.screen.studio/)，讓 AI agent 代你錄影和剪片，你不用坐在鍵盤前面。

這是 [ShawnPana/screenstudio-cli](https://github.com/ShawnPana/screenstudio-cli) 的 fork，重寫的目標只有一個：**agent 必須知道錄影到底成功了沒有。**

English: [README.md](README.md)

---

## 為甚麼要 fork

我經常要錄螢幕 — 產品示範、工作坊教材、客戶影片裏的畫面素材。錄影本身是最沉悶的一環：排好視窗、按下錄影、講解、停止、等待、再去找檔案。

這種工作應該交給 agent。但 Screen Studio 本身沒有任何自動化介面，沒有 AppleScript，沒有 URL scheme，也沒有 CLI。Shawn Pana 這個專案用 Chrome DevTools Protocol 打通了這條路，所以我從他的版本開始。

它可以用。但它是為「有人盯著螢幕」而設計的，而 agent 並不會盯著螢幕。

## 改了甚麼，為甚麼要改

原版把指令送給 app 之後，直接把回應丟掉，然後印出成功訊息：

```js
bridge.client.mutation("capture.finish").then(function() {}).catch(function() {});
// ...然後，無論如何都會執行：
output({ success: true, message: "Recording stopped and saved" });
```

那個空的 `.catch()` 會吞掉所有錯誤。即使停止錄影失敗了，畫面上仍然顯示「Recording stopped and saved」。人坐在電腦前會察覺得到；但 agent 在無人看管的情況下執行，它會回報一段根本不存在的影片已經完成。

| | 原版 | 這個版本 |
|---|---|---|
| `record stop` | 一定印出成功 | 先等 app 真正回應，再等 `.screenstudio` 檔案出現在硬碟上並停止增長，然後回傳檔案路徑和實際錄到的秒數。沒有存檔就以錯誤結束。 |
| `record start` | 比第一格畫面早約 4.2 秒返回，所以 start 和 stop 之間 `sleep 10`，實際只錄到約 6 秒 | 加上 `--wait`，要等到真正開始錄影才返回。要求 10 秒，實際錄到 9.97 秒。 |
| `record pause` / `resume` / `cancel` | 一定印出成功 | 會如實回報失敗 |
| 關閉 debug port | 做不到。`launch` 打開了它，卻沒有東西可以關上 | 新增 `quit`，關掉 app 並確認 port 已經關閉 |
| Shell 參數 | 用雙引號包起，檔名裏的 `$(...)` 仍然會被執行 | 改用單引號 |

### 用結果驗證，而不是開口問

Screen Studio 沒有「我正在錄影嗎」這種查詢。所有合理的名稱都問不到東西：

```
capture.state · capture.status · capture.getState · capture.isRecording
capture.info  · capture.current · capture.get     · recording.state
→ "No query-procedure on path"
```

所以 `record stop` 不會問 app 成功了沒有。它去看 app 應該產生的東西 — 專案檔案有沒有出現在硬碟上、有沒有寫完 — 然後回報這件事。這樣比較慢，但它不會說謊，而且下一個版本改了內部名稱時也不會失靈。

```json
{
  "success": true,
  "project": "/Users/you/Screen Studio Projects/Built-in Retina Display ....screenstudio",
  "capturedSeconds": 9.97
}
```

## 執行環境

- macOS
- Screen Studio — 在 **3.7.3-4475**、macOS 26.5.1 上驗證過
- Node.js 21 或以上，需要內建的 WebSocket
- ffmpeg 和 ffprobe，`render` 和 `analyze` 會用到 — `brew install ffmpeg`
- 終端機需要「輔助使用」權限，否則讀不到視窗和螢幕資訊

## 安裝

```bash
git clone https://github.com/HyperfocuSam/screenstudio-agent.git
cd screenstudio-agent
npm install
npx tsc
ln -s "$PWD/bin/screenstudio.js" ~/.local/bin/screenstudio   # 或放到你 PATH 上任何位置
```

不會發佈到 npm。自己 clone、自己看過、自己 build — 一個可以錄下你整個螢幕的工具，程式碼應該掌握在自己手上。

## 快速開始

```bash
screenstudio launch                              # 開啟 Screen Studio，同時打開 debug port
screenstudio record displays                     # 有甚麼可以錄？
screenstudio record start --display 0 --wait     # 真正開始錄影之後才返回
sleep 30
screenstudio record stop                         # 回傳存檔路徑
screenstudio quit                                # 關掉 app，同時關掉 port
```

## 安全性

這個工具的運作方式，是用 `--remote-debugging-port=9222` 啟動 Screen Studio。用之前請先了解這代表甚麼。

**在 3.7.3-4475 上實測確認：**

- 這個 port 只綁定 `127.0.0.1`。網絡上的其他裝置無法連進來。
- Screen Studio 的視窗關閉了 Node 存取權限 — `require`、`process`、`module`、`__dirname` 全部是 undefined。連上這個 port 並不等於拿到你電腦的 shell。
- 但是通往主程序的 `electronTRPC` 橋接仍然存在。只要 port 開著，本機任何一個程序都可以操控 Screen Studio，包括開始錄影。

所以：**每次做完都要執行 `screenstudio quit`。** port 沒關上時它會以錯誤結束，所以指令稿可以放心依賴它。要用才開，用完就關，不要整天開著。

這個工具不會把任何資料送出去。只有一個 runtime 相依套件（`commander`），沒有安裝指令稿，所有網絡連線都指向本機。

---

## 指令

### 錄影

```bash
screenstudio record displays                                  # 列出螢幕，以及上面有甚麼 app
screenstudio record windows                                   # 列出視窗和標題
screenstudio record start --display 0 --wait                  # 錄某個螢幕，等到真正開始
screenstudio record start --app Terminal                      # 錄某個 app 所在的螢幕
screenstudio record start --mode window --title "YouTube"     # 用標題指定某個視窗
screenstudio record pause                                     # 暫停
screenstudio record resume                                    # 繼續
screenstudio record stop                                      # 停止、存檔、驗證、回傳路徑
screenstudio record stop --no-verify                          # 略過硬碟驗證
screenstudio record cancel                                    # 停止並丟棄
```

`record displays` 會顯示每個螢幕上有哪些 app，所以你不會錄錯。`--app` 會自動判斷目標 app 在哪個螢幕。視窗模式用 AppleScript 比對視窗標題。

錄影檔案的搜尋範圍是 `~/*Screen Studio Projects*`。如果你存到別處，設定 `SCREENSTUDIO_PROJECTS_DIR`。

### 時間軸（slices）

```bash
screenstudio slice list                              # 列出所有片段
screenstudio slice split 15000                       # 在第 15 秒切開（來源毫秒）
screenstudio slice remove 2                          # 依索引刪除片段
screenstudio slice remove --from 6000 --to 8000      # 刪除一段時間範圍
screenstudio slice speed 0 2.0                       # 把片段 0 設成 2 倍速
screenstudio slice merge 1                           # 把片段 1 和下一段合併
screenstudio slice trim 0 --start 2000 --end 10000   # 直接調整起訖點
```

### 縮放（zooms）

```bash
screenstudio zoom list                                       # 列出所有縮放範圍
screenstudio zoom add 0 --level 2 --end 50000 --id my_zoom   # 新增並自訂 ID
screenstudio zoom add 0 --level 2 --x 0.3 --y 0.8            # 指定目標位置
screenstudio zoom remove <id>                                # 依 ID 刪除
screenstudio zoom update <id> --level 3 --x 0.5 --y 0.5      # 修改屬性
screenstudio zoom split <id> 25000                           # 在某個時間點切開
screenstudio zoom set '[{...}, {...}]'                       # 一次性全部取代
```

縮放操作內部走 `scene.update({ zoomRanges })`，比較可靠。Screen Studio 內建的 `addZoomRangeAt()` 有機會覆蓋掉相鄰的範圍。

### 遮罩（masks）

```bash
screenstudio mask list
screenstudio mask add 0 10000 --x 100 --y 200 --width 400 --height 50 --blur 20
screenstudio mask update <id> --x 150 --width 500
screenstudio mask remove <id>
screenstudio mask clear
```

### 設定

```bash
screenstudio config --list                            # 全部 68 個設定值
screenstudio config backgroundColor                   # 讀取
screenstudio config backgroundColor "#FF0000"         # 寫入，畫面即時更新
```

### 預覽與驗證

```bash
screenstudio preview                                  # 擷取預覽畫面
screenstudio preview --at 5000 --open                 # 跳到第 5 秒、擷取、打開來看
screenstudio seek 10000                               # 移動播放頭
screenstudio render --fps 10 --from 3000 --to 6000    # 用 ffmpeg 輸出含縮放的畫格
screenstudio analyze --interval 2                     # 抽取畫格和操作事件時間軸
```

agent 看不到影片。這幾個指令就是它檢查自己成果的方法 — 把剛剛改動的段落輸出成畫格，看一看，確認改動真的生效。

### 專案

```bash
screenstudio project info        # 名稱、長度、是否有未存檔改動
screenstudio project save
screenstudio project undo        # 復原上一個 CLI 改動
screenstudio project redo
```

### 匯出

```bash
screenstudio export                  # 打開匯出視窗（Cmd+Shift+E）
screenstudio export --clipboard      # 快速匯出到剪貼簿
```

### 直接執行

```bash
screenstudio exec '$project.name'
screenstudio exec --file script.js
echo '$projects.size' | screenstudio exec -
```

### App 開關

```bash
screenstudio launch              # 啟動並打開 debug port
screenstudio launch --port 9333  # 自訂 port
screenstudio status              # 連上了沒有？現在開著甚麼？
screenstudio quit                # 結束並確認 port 已經關閉
screenstudio quit --force        # 它不肯乖乖關掉時強制處理
```

## 通用參數

- `--json` — 輸出結構化 JSON。要放在指令前面：`screenstudio --json state`
- `--port <n>` — CDP port，預設 9222

## 內部設計

**`$project` 和 `$projects` 的分別** — CLI 用的是 `window.$project`，即目前作用中的專案，而不是 `$projects` 的第一項。同時開著多個專案時，才不會改錯。

**怎樣找到錄影按鈕** — 錄影是靠遍歷 React fiber tree，找出標籤為「Record display」「Record window」「Record area」的元件，然後呼叫它們的 `onClick`。在 3.7.3-4475 上確認全部存在。這比用 CSS 選擇器可靠，因為那些名稱每次重新 build 都會改。

**怎樣知道錄影開始了** — 錄影選擇器會產生額外的 CDP 頁面。`--wait` 會一直等到頁面數量穩定下來，再等一段實測出來的緩衝。它等的是「穩定」而不是某個固定數字，所以接上不同數量的螢幕仍然有效。

**復原** — 每次改動之前都會先呼叫 `p.history.update()`，所以 `screenstudio project undo` 一定可以還原任何 CLI 改動。

**速度** — Screen Studio 內部存的是 `timeScale = 1/speed`，所以 4 倍速是 `timeScale: 0.25`。`slice speed` 會幫你換算，直接填你想要的速度就可以。

**影片檔名** — 錄影檔可能叫 `channel-1-display-0.mp4`，也可能是 `channel-2-display-0.mp4`。CLI 會用 `channel-*-display-*.mp4` 找出正確那一個。

## Agent skill

`skills/screenstudio-cli/SKILL.md` 是給 Claude Code 一類 agent 用的 skill 檔案。把整個資料夾放進 `~/.claude/skills/`，agent 就會學到指令集、必須執行 `quit` 這條規矩，以及「先看、改動、再看」的做法 — 改之前先輸出畫格看一次，改完再看一次，因為 agent 沒辦法直接看影片。

`references/demo.md` 講的是終端機和瀏覽器並排錄影的做法，包括取景用的縮放格線。

---

## 這是怎樣做出來的

這個 fork 同時也是一份紀錄，記下我怎樣和 agent 一起工作。整個過程 — 安全審查、fork、修正、測試 — 是和 Claude Code 一節工作完成的。真正令它成立的，不是我開口要程式碼，而是不接受任何未經證實的說法。

**安裝之前先查供應鏈，不要事後才查。** 看 GitHub 上的原始碼，並不代表你知道 npm 實際上發佈了甚麼 — 那是兩件不同的東西。所以：把原始碼 clone 下來，自己 build 一次，再和已發佈的套件比對。

```
npm ci --ignore-scripts && npx tsc
diff -rq rebuilt/dist  published/dist
→ 完全相同
```

九十秒，這個問題就有了答案，而不是靠假設。

**安全邊界要實測，不要推論。** 「它會打開一個 debug port」這句話，可以代表完全無害，也可以代表整台電腦被人遠端執行程式。答案來自實際啟動 app、讀它的內部狀態：port 只綁本機、Node 存取關閉、但 IPC 橋接是通的。這是可以據此行動的具體結論，不是一種模糊的擔心。

**要量度，不要估計。** 第一次錄出來的片段太短。與其猜一個延遲數字，不如直接量：13 秒的實際時間錄到 8.83 秒，6 秒錄到 1.39 秒。穩定地少了 4.2 秒，於是它有了一個真正的修正，而不是一個憑空填上去的數字。

**不要相信第一個答案，包括自己的。** agent 一開始告訴我，錄影功能在這個版本上大概是壞的，還說了理由。結果理由和機制都錯了 — 那段程式碼根本沒有引用它所謂缺少的東西。實測花了兩分鐘，然後把記錄更正過來。一個不肯說「這件事我搞錯了」的 agent，比沒有 agent 更糟。

**用結果驗證。** 這裏每一項修正，最後都回到同一個想法：不要問系統成功了沒有，去看它應該產生的東西在不在。

---

## 出處

建基於 Shawn Pana 的 [ShawnPana/screenstudio-cli](https://github.com/ShawnPana/screenstudio-cli) — CDP 這條路、指令的架構、剪接的模型，都是他的成果。原專案採用 MIT 授權，這個 fork 同樣是 MIT。

Screen Studio 是 Adam Pietrasiak 的商業軟件。本專案與它沒有任何從屬關係，也未獲它認可，並且是透過一個不受支援的除錯介面操控它 — 任何一次更新都有可能令它失效。

## 授權

MIT，見 [LICENSE](LICENSE)。
