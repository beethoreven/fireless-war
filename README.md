# fireless-war

## 中文

「願浮沉2:無火戰爭」專案總覽 repo,透過 git submodule 把各子系統掛在一起,方便一次 `clone` 齊全部程式碼。這個 repo 本身**不會被部署**——各子系統各自連到自己的 repo 做部署(見下表),這裡純粹是本機開發時的統一入口。系統是什麼、怎麼串起來、用了哪些技術與決策,見下方的[專案報告](#專案報告)。

### 子系統

| 子系統 | Repo | 部署 |
|---|---|---|
| 後端 API | [`router-backend`](https://github.com/beethoreven/router-backend) 的 `apps/fireless_war/`(好幾個專案共用的後端) | Render(`https://router-backend-3hl2.onrender.com/fireless-war`) |
| 前端網站 | [`fireless-war-web`](https://github.com/beethoreven/fireless-war-web) | GitHub Pages(從 repo 根目錄) |

未來會加入的子系統(DB、mobile)用同樣方式以 `git submodule add` 掛進來。

### 使用方式

**第一次拿到全部程式碼:**

```bash
git clone --recurse-submodules git@github.com-beethoreven:beethoreven/fireless-war.git
```

**已經 clone 過,只是要把子模組抓齊:**

```bash
git submodule update --init --recursive
```

**更新某個子模組到它自己 repo 的最新版本:**

```bash
cd fireless-war-web   # 或 router-backend
git pull origin main
cd ..
git add fireless-war-web
git commit -m "Update fireless-war-web submodule pointer"
```

最後這個 `git add` + `commit` 不能省略——沒做的話,子模組本機檔案雖然是新的,但這個 wrapper repo 記錄的「該指向哪個 commit」還是舊的,別人 `clone` 這個 repo 還是會抓到舊版本。

### 專案報告

#### 這是什麼

「願浮沉2:無火戰爭」是一個 MMP(謀殺之謎,又稱劇本殺)的 game master 輔助網站。遊戲的核心資料(五位角色的事業等級、金錢、積分等)存在 Google Sheet 裡,主持人透過網頁輸入場次的日期時間,系統會讀取(或協助建立)對應的 Sheet 檔案,並把裡面的數字整理成長條圖、總覽數據,取代主持人自己在 Sheet 裡人工核對的過程。

#### 系統架構

```
fireless-war/              ← 本 repo,本機開發統一入口,本身不部署
├── fireless-war-web/      ← 前端,部署到 GitHub Pages(純靜態 HTML/CSS/JS)
└── router-backend/        ← 好幾個專案共用的後端,部署到 Render;
                             本專案在 apps/fireless_war/,掛在 /fireless-war
```

資料源頭是 Google Sheets(每場遊戲一份獨立檔案,複製自共用的 Template),後端用 Service Account 身分唯讀存取。前端完全是 vanilla JavaScript,沒有任何前端框架或建置流程,直接把 `.html`/`.css`/`.js` 丟給 GitHub Pages 服務。

#### 後端技術棧與關鍵決策

Flask,跑在 router-backend 這個共用服務裡:整個服務是一支 gunicorn(1 個 worker、16 個 threads),依網址前綴把請求分給各專案的 Flask app,本專案在 `/fireless-war`。部署在 Render 免費方案。主要相依套件:`Flask`、`Flask-Limiter`、`gspread`、`google-auth`、`requests`(版本見 router-backend 的 `requirements.txt`)。

**Google Sheets 存取。** 用 `gspread` + Service Account 憑證唯讀存取。Google Sheets API 配額是「每個 Service Account 身分每分鐘 60 次讀取」,因此一個請求裡的所有讀取都合併成單次 `values_batch_get` 呼叫(`google_access.py` 的 `sheet_batch_read`),而不是逐格分開打 API——`/round` 原本要打 8 次 API,合併後只需要 1 次。`/round` 另外掛了 Flask-Limiter 的**全站共用**(不分 IP、不分主持人)`30 次/分鐘`限制,因為要保護的是全站共用的單一 Service Account 配額,不是防止單一使用者太活躍。這個限制只對**通過驗證的請求**扣額度(`deduct_when`,401 與 503 不算)——Flask-Limiter 的檢查發生在身分驗證之前,如果連未登入的 401 都算進去,任何陌生人都能靠灌爆這個共用額度,把所有主持人鎖在門外一整分鐘。計數存在行程記憶體裡,服務只有 1 個 worker,所以不會各算各的。

**建立新場次檔案:為什麼要繞一圈用 Apps Script。** 直接用 Service Account 呼叫 Google Drive API 複製 Template 有兩條路,都走不通:
1. Service Account 直接 `copy()`:報 `storageQuotaExceeded`——Service Account 沒有自己的 Drive 儲存額度,無法擁有新建立的檔案,這是 Google 對這種身分類型的結構性限制。
2. OAuth(代表真人帳號)+ Google Picker:理論上能繞開額度問題,但實測下來,Picker 選取既有檔案後的授權登記一直沒有生效(`files.get` 持續回 404)。

採用的方案:一支 **Google Apps Script**,部署成 Web App,後端用 HTTP 請求呼叫它(帶一組共用密鑰)。Apps Script 執行時用的是擁有者自己的 Google 帳號完整權限,不受上述兩個限制影響,`DriveApp.makeCopy()` 是 Google 原生的複製動作,公式、格式都完整保留。**這支 Apps Script 不在任何 git repo 裡**——它只存在於 Google 的 Apps Script 編輯器(script.google.com),透過網頁介面編輯與部署。

**對外呼叫一律有逾時。** Google API 15 秒、Service Account 憑證更新 10 秒、Apps Script 30 秒。服務是好幾個專案共用的,一個卡住的外部呼叫不能一直佔著 thread。

**Google 登入驗證。** 前端用 Google Identity Services(GIS)取得登入後的 ID Token(JWT),每次呼叫 API 都夾帶 `Authorization: Bearer <token>`;後端(`auth.py`,用 router-backend 共用的 `shared.google_auth`)驗證 token 的簽章、有效期限與 audience(確認是發給本專案的 OAuth Client ID),拿到「Google 保證過的」email 再比對白名單。驗證發生在後端,無法被瀏覽器 devtools 繞過。本專案刻意**不做自己的登入 session**:每個請求都重新驗證 Google 的 ID Token(原因見下方「Google 登入 UI」)。

後端刻意區分兩種「驗證沒過」:token 真的無效/過期回 `401`;連不上 Google 拿公開金鑰之類的暫時性故障回 `503`。前端的處理方式完全不同——只有 `401` 才會把使用者登出、清掉 token。因為 `currentIdToken` 一旦被清空,45 分鐘那次靜默續期的排程(條件是 `if (currentIdToken)`)就會永久停止,而登入列在第二頁之後是隱藏的,使用者連重新登入的入口都看不到。所以前端遇到網路失敗或 `503` 時,會保留 token、鎖住讀取按鈕,並以指數退避(5 秒→60 秒上限)自動重試。

**主持人白名單。** 從 `FIRELESS_WAR__PERMITTED_USERS` 環境變數讀取(逗號分隔的 email 清單),比對時不分大小寫,不寫死在程式碼裡——這份清單是真實個人資料,不該進版本控制。沒設定時視為空清單,也就是沒有任何人被授權(壞掉時關閉存取,而不是不小心開放給所有人)。要開放給新的主持人,不用改程式碼:到 Render 上 router-backend 服務的 Environment 編輯這個變數,存檔後自動重新部署(共用服務裡的其他專案也會跟著重啟一次)。

**設定與環境變數。** 全部以 `FIRELESS_WAR__` 開頭,只設在 Render,不進任何 repo:

| 變數 | 用途 |
|---|---|
| `FIRELESS_WAR__GOOGLE_CLIENT_ID` | 驗證 ID Token 的 audience,必須跟前端 GIS 用的 Client ID 相同 |
| `FIRELESS_WAR__PERMITTED_USERS` | 主持人白名單 |
| `FIRELESS_WAR__SERVICE_ACCOUNT_JSON` | Service Account 金鑰檔的完整 JSON 內容 |
| `FIRELESS_WAR__DRIVE_FOLDER_ID` | 場次檔案所在的 Drive 資料夾 |
| `FIRELESS_WAR__APPS_SCRIPT_URL` | Apps Script Web App 的網址 |
| `FIRELESS_WAR__APPS_SCRIPT_SECRET` | 呼叫 Apps Script 的共用密鑰 |
| `FIRELESS_WAR__ALLOWED_ORIGINS` | 允許跨來源呼叫的確切網址(逗號分隔) |
| `FIRELESS_WAR__SPREADSHEET_ID` | 選填;`/round` 沒帶 `spreadsheet_id` 時的備用 |

必填的少了任何一個,本專案的每個請求都回 `503`(`not_configured`),`/fireless-war/ready` 會列出缺了哪些;共用服務裡的其他專案不受影響。

**其他安全性強化。**
- **CORS**:只允許 `FIRELESS_WAR__ALLOWED_ORIGINS` 列出的確切網址,並明確放行 `Authorization` header(沒有這行,瀏覽器的 CORS 預檢會擋下這個 header)。
- **SRI(Subresource Integrity)**:前端引入的 Chart.js / chartjs-plugin-datalabels CDN script 都加了 SRI hash,防止 CDN 被竄改後注入惡意程式碼(Google Identity Services 的 script 刻意不加,因為它的內容本來就會隨時變動)。
- **錯誤回應**:統一回 `{"error", "code"}`,不把套件內部的錯誤訊息原文回給前端;請求內容上限 16 KB。

**Render 免費方案的 Keep-Alive。** Render 免費方案閒置約 15 分鐘會休眠,喚醒(cold start)可能要 30~90 秒以上。前端只要分頁還開著,一載入就先打一次共用服務的 `/health`,之後每 5 分鐘再打一次——只要主持人在玩,後端就不會閒置超過 15 分鐘。`/health` 不載入任何專案、不碰資料庫,也不回 CORS 標頭;前端只需要請求送到、不讀回應,所以用 `no-cors`。不用 GitHub Actions 排程,是因為實測 `schedule` 觸發的間隔常常拉長到 1~4 小時,遠超過休眠門檻。

**檔案結構。** 本專案在 router-backend 裡的部分:

```
apps/fireless_war/
  ├── app.py              create_app:建 Flask app、CORS、Limiter
  ├── routes.py           所有路由與限流
  ├── auth.py             ID Token 驗證與白名單
  ├── config.py           讀取 FIRELESS_WAR__ 設定、常數
  ├── google_access.py    Sheet/Drive/Apps Script 存取層,只知道怎麼跟 API 對話
  ├── parse_data.py       業務邏輯:A~J 欄代表什麼、回合資料解析與計算
  └── record_data.py      場次檔案查詢與建立
tests/fireless_war/        測試(Google 一律以假物件取代,不會真的連線)
```

#### 前端技術棧與關鍵決策

Vanilla JavaScript(無框架、無建置流程),`Chart.js` + `chartjs-plugin-datalabels` 畫長條圖,Google Fonts 的 Noto Sans TC 作為主字型,整站部署在 GitHub Pages(Free 方案要求 repo 是 Public 才能開啟 Pages 功能)。

**三頁式流程。**
1. **第一頁**:輸入日期時間 → `GET /record` 查詢對應的場次 Sheet 是否存在。找到就直接進第二頁;找不到(404)則詢問是否要 `POST /record` 建立新場次(複製自 Template),建立成功後停在第一頁,再按一次讀取進第二頁。
2. **第二頁**:開場介紹畫面(「為期七日」「無火戰爭」+「正式開始!」按鍵),純粹的轉場頁,不會在這裡打任何 API——按下按鍵才會去抓資料進第三頁。
3. **第三頁**:長條圖總覽——五位角色各自的事業等級長條圖、持有金錢/積分、共同數據面板(合法/非法事業加總、風頭事業指標、崩壞警示),搭配底部的回合切換器(水平滾輪選擇器,15 個回合選項)。

**資料視覺化邏輯。** 每位角色的五項事業(正當事業/闇金/色情/毒品/軍火)畫成長條圖,Y 軸固定 0–25。三個全域轉換開關(`oniwara_out`/`mike_out`/`kouno_single`)會改變顯示邏輯——例如 `oniwara_out=true` 時,鬼原響介的事業「洗白」,顯示名稱與計入合法/非法事業的方式都會改變。共同數據面板會即時判斷「合法事業 vs 非法事業」的差距,超過閾值顯示崩壞警示;若 `Global_Param!B10` 開關開啟,額外計算並顯示「風頭事業」(非法事業四類加總最高者,同分時毒品優先於金融、軍火、色情)。

**Google 登入 UI。** 登入狀態只在第一頁顯示,進入第二頁後自動隱藏。不做任何 client-side 持久化(沒有用 localStorage/cookie 存 token)——重新整理後靠 Google Identity Services 的靜默重新登入(`prompt({auto_select:true})`)嘗試無感恢復;如果瀏覽器裡有多個 Google 帳號同時登入,Google 會要求手動選一次帳號(這是 Google 平台自身的隱私限制)。刻意不做持久化的原因:存了 token,主持人被從白名單移除後,舊分頁可能要等 token 真的過期才會感覺到權限被收回;不存,才能保證後端白名單一改,下次重新整理立刻生效。

**英文 Demo(`/demo/`)。** 給公開展示用的英文版,流程與正式版相同,差別在:任何 Google 帳號登入即可使用(不檢查白名單)、打 `/demo-record`、`/demo-round`、複製的是 `FirelessWar_Demo` 而不是正式 Template、角色換成通用名稱。因為對所有人開放,限流較嚴:`/demo-record` 查詢與建立各 `10 次/小時`、`/demo-round` `10 次/分鐘`(全站共用)。

#### 資料流程總覽

主持人登入 → 輸入日期時間 → `GET /record`(帶 Bearer token)查詢場次檔案 → 找到 `spreadsheet_id` 或建立新檔案 → 進入介紹頁 → 按「正式開始!」→ `GET /round`(帶 `spreadsheet_id` + Bearer token)一次性 batch 讀取該回合所有資料 → 前端渲染長條圖與共同數據 → 之後每次用底部的回合切換器換回合,重複呼叫 `GET /round`。

#### 已知限制

- `oniwara_out`/`mike_out`/`kouno_single` 三個轉換開關、以及「城市經濟崩壞」這個最嚴重等級的警示,目前都只用合成測試資料驗證過邏輯,還沒在真實遊戲中實際觸發驗證過。
- `最終結算`(FinalDayResult)這個回合是否要有特殊畫面表現,尚未決定。
- `GET /round?spreadsheet_id=` 不會驗證這個 ID 是不是「合法建立過的場次檔案」,理論上帶入任意 Service Account 讀得到的 Sheet ID 也會嘗試讀取。
- 剛建立完場次就馬上按讀取,可能還是回 404、再次跳出新建對話框:查詢靠 Drive 的檔名搜尋,新檔案要過幾秒才搜得到。等幾秒重試即可。

---

## English

The project-overview repo for *Dreaming of a damp squib 2 - Fireless War*, wiring its subsystems together via git submodules so the whole codebase can be pulled with a single `clone`. This repo itself **is never deployed** — each subsystem connects to its own repo for deployment (see the table below); this one is purely a unified local-dev entry point. For what the system is, how it's wired together, and the technologies and decisions behind it, see the [Project Report](#project-report) below.

### Subsystems

| Subsystem | Repo | Deployment |
|---|---|---|
| Backend API | [`router-backend`](https://github.com/beethoreven/router-backend), `apps/fireless_war/` (a backend shared by several projects) | Render (`https://router-backend-3hl2.onrender.com/fireless-war`) |
| Frontend | [`fireless-war-web`](https://github.com/beethoreven/fireless-war-web) | GitHub Pages (served from repo root) |

Future subsystems (DB, mobile) will be wired in the same way via `git submodule add`.

### Usage

**First time cloning everything:**

```bash
git clone --recurse-submodules git@github.com-beethoreven:beethoreven/fireless-war.git
```

**Already cloned, just need to fetch the submodules:**

```bash
git submodule update --init --recursive
```

**Updating a submodule to its own repo's latest version:**

```bash
cd fireless-war-web   # or router-backend
git pull origin main
cd ..
git add fireless-war-web
git commit -m "Update fireless-war-web submodule pointer"
```

That final `git add` + `commit` cannot be skipped — without it, the submodule's local files are up to date, but this wrapper repo's recorded "which commit to point at" is still stale, so anyone else who `clone`s this repo will still get the old version.

### Project Report

#### What This Is

*Dreaming of a damp squib 2 - Fireless War* is a game-master companion web app for a Murder Mystery Game. The game's core data (five characters' business levels, money, and integral points) lives in a Google Sheet. The GM enters a session's date/time on the web page, the system finds (or helps create) the matching Sheet file, and renders the numbers as bar charts and summary panels — replacing manual cross-referencing inside the spreadsheet.

#### System Architecture

```
fireless-war/              ← this repo, unified local-dev entry point, never deployed itself
├── fireless-war-web/      ← frontend, deployed to GitHub Pages (pure static HTML/CSS/JS)
└── router-backend/        ← a backend shared by several projects, deployed to Render;
                             this project lives in apps/fireless_war/, mounted at /fireless-war
```

Data lives in Google Sheets (one independent file per game session, copied from a shared Template); the backend accesses it read-only via a Service Account. The frontend is plain vanilla JavaScript with no framework or build step — the `.html`/`.css`/`.js` files are served directly by GitHub Pages.

#### Backend Stack & Key Decisions

Flask, running inside router-backend, a shared service: one gunicorn process (1 worker, 16 threads) routes requests by URL prefix to each project's Flask app; this one is at `/fireless-war`. Deployed on Render's free tier. Key dependencies: `Flask`, `Flask-Limiter`, `gspread`, `google-auth`, `requests` (versions in router-backend's `requirements.txt`).

**Google Sheets access.** Read-only access via `gspread` with Service Account credentials. Google's Sheets API quota is 60 reads/minute per Service Account identity, so all reads within one request are merged into a single `values_batch_get` call (`sheet_batch_read` in `google_access.py`) instead of one call per cell/range — `/round` used to make 8 separate API calls per request, now just 1. `/round` also carries a Flask-Limiter rate limit of 30/minute that is **global** (not per-IP, not per-GM), because the resource being protected is the shared Service Account quota itself, not any single user's activity. The limit only deducts for requests that pass authentication (`deduct_when`; 401s and 503s don't count) — Flask-Limiter's check runs before authentication, so counting unauthenticated 401s too would let any stranger exhaust the shared budget and lock every GM out for a full minute. Counters live in process memory; the service runs a single worker, so they are never split.

**Why creating a new session file goes through Apps Script.** There are two ways to copy the Template with the Google Drive API directly, and neither works:
1. Direct Service Account `copy()`: fails with `storageQuotaExceeded` — Service Accounts have no Drive storage quota of their own and structurally cannot own newly-created files.
2. OAuth (real user identity) + Google Picker: should sidestep the quota issue, but in testing, the authorization granted after picking an existing file never took effect (`files.get` kept returning 404).

The approach used: a **Google Apps Script**, deployed as a Web App, called by the backend over HTTP (with a shared secret). Apps Script runs with the full permissions of its owner's Google account, sidestepping both limitations above — `DriveApp.makeCopy()` is Google's native copy operation and preserves formulas and formatting. **This Apps Script is not in any git repo** — it exists only inside Google's Apps Script editor (script.google.com), edited and deployed through that web interface.

**Every outside call has a timeout.** Google APIs 15 s, Service Account token refresh 10 s, Apps Script 30 s. The service is shared by several projects, so a stuck outside call must not hold a thread indefinitely.

**Google sign-in verification.** The frontend uses Google Identity Services (GIS) to obtain an ID Token (JWT) after sign-in, sent as `Authorization: Bearer <token>` on every API call. The backend (`auth.py`, using router-backend's shared `shared.google_auth`) verifies the token's signature, expiry, and audience (confirming it was issued for this project's OAuth Client ID), then checks the Google-verified email against the whitelist. Verification happens server-side, so it can't be bypassed from browser devtools. This project deliberately **keeps no sign-in session of its own**: every request verifies the Google ID Token again (the reason is under "Google Sign-In UI" below).

The backend deliberately distinguishes two kinds of "verification failed": a genuinely invalid/expired token returns `401`; a transient failure (e.g. can't reach Google's public keys) returns `503`. The frontend treats these very differently — only `401` signs the user out and clears the token. Clearing `currentIdToken` would permanently stop the 45-minute silent-refresh interval (guarded by `if (currentIdToken)`), and since the top bar is hidden from page 2 onward, the user would have no visible way back in. So on a network failure or `503`, the frontend keeps the token, locks the read button, and retries on exponential backoff (5 s, capped at 60 s).

**GM whitelist.** Read from the `FIRELESS_WAR__PERMITTED_USERS` environment variable (comma-separated emails), compared case-insensitively, never hardcoded — this is real personal data that shouldn't be in version control. When unset, nobody is authorized (a deliberate fail-closed default). Authorizing a new GM needs no code change: edit the variable in the Environment settings of the router-backend service on Render, which triggers an automatic redeploy (the other projects in the shared service restart once too).

**Settings and environment variables.** All prefixed `FIRELESS_WAR__`, set only on Render, never in any repo:

| Variable | Purpose |
|---|---|
| `FIRELESS_WAR__GOOGLE_CLIENT_ID` | The audience ID Tokens are checked against; must match the Client ID the frontend's GIS uses |
| `FIRELESS_WAR__PERMITTED_USERS` | GM whitelist |
| `FIRELESS_WAR__SERVICE_ACCOUNT_JSON` | The full JSON contents of the Service Account key file |
| `FIRELESS_WAR__DRIVE_FOLDER_ID` | The Drive folder holding session files |
| `FIRELESS_WAR__APPS_SCRIPT_URL` | The Apps Script Web App URL |
| `FIRELESS_WAR__APPS_SCRIPT_SECRET` | Shared secret for calling Apps Script |
| `FIRELESS_WAR__ALLOWED_ORIGINS` | Exact origins allowed to make cross-origin calls (comma-separated) |
| `FIRELESS_WAR__SPREADSHEET_ID` | Optional; fallback when `/round` is called without `spreadsheet_id` |

If any required one is missing, every request to this project returns `503` (`not_configured`) and `/fireless-war/ready` lists which ones are missing; the other projects in the shared service are unaffected.

**Other security hardening.**
- **CORS**: only the exact origins listed in `FIRELESS_WAR__ALLOWED_ORIGINS`, with `Authorization` explicitly allowed in preflight (without it, the browser's CORS preflight blocks the header and every authenticated call fails).
- **SRI (Subresource Integrity)**: the Chart.js / chartjs-plugin-datalabels CDN `<script>` tags carry SRI hashes to guard against a compromised CDN injecting malicious code (Google Identity Services' script deliberately has none, since its content is expected to change server-side).
- **Error responses**: always `{"error", "code"}`; library-internal error text is never passed through to the frontend. Request bodies are capped at 16 KB.

**Keep-alive for Render's free tier.** Render's free tier sleeps after ~15 minutes idle; waking up (cold start) can take 30–90+ seconds. As long as a tab is open, the frontend pings the shared service's `/health` once on load and every 5 minutes after — as long as a GM is playing, the backend never sees 15 minutes of idle. `/health` loads no project, touches no database, and sends no CORS headers; the frontend only needs the request to arrive, not to read the response, so it uses `no-cors`. A GitHub Actions schedule isn't used because, measured, its `schedule` trigger often stretched gaps to 1–4 hours, far beyond the sleep threshold.

**File layout.** This project's part of router-backend:

```
apps/fireless_war/
  ├── app.py              create_app: builds the Flask app, CORS, Limiter
  ├── routes.py           all routes and rate limits
  ├── auth.py             ID token verification and the whitelist
  ├── config.py           reads FIRELESS_WAR__ settings; constants
  ├── google_access.py    Sheet/Drive/Apps Script access layer — only knows how to talk to the APIs
  ├── parse_data.py       business logic: what columns A–J mean, round-data parsing & computation
  └── record_data.py      session-file lookup & creation
tests/fireless_war/        tests (Google is always faked; nothing goes over the network)
```

#### Frontend Stack & Key Decisions

Vanilla JavaScript (no framework, no build step), `Chart.js` + `chartjs-plugin-datalabels` for bar charts, Google Fonts' Noto Sans TC as the primary typeface, deployed entirely on GitHub Pages (the free tier requires the repo be Public to enable Pages).

**Three-page flow.**
1. **Page 1**: enter a date/time → `GET /record` checks whether the matching session Sheet exists. Found → go straight to page 2; not found (404) → offer to `POST /record` to create a new one (copied from the Template); after it's created the page stays on page 1, and clicking read again enters page 2.
2. **Page 2**: an intro splash ("為期七日" / "無火戰爭" + a "正式開始!" button) — a pure transition screen, no API call happens here; only clicking the button fetches data and advances to page 3.
3. **Page 3**: the chart-grid overview — each of the five characters' business-level bar chart, money/points, a common-data panel (legal/illegal business totals, the hot-business indicator, a collapse warning banner), plus a round switcher at the bottom (a horizontal scroll-wheel picker with 15 round options).

**Data visualization logic.** Each character's five business categories (general/finance/sex/drug/arms) render as a bar chart, Y-axis fixed at 0–25. Three global toggles (`oniwara_out`/`mike_out`/`kouno_single`) change display logic — e.g. when `oniwara_out` is true, Oniwara's businesses "go legitimate," changing both their display labels and how they're counted toward legal vs. illegal totals. The common-data panel evaluates the legal-vs-illegal gap live and shows a collapse warning past a threshold; if the `Global_Param!B10` toggle is on, it additionally computes and shows the "hot business" (the illegal category with the highest summed level across characters, ties broken drug > finance > arms > sex).

**Google sign-in UI.** The sign-in UI only appears on page 1, auto-hidden from page 2 onward. There is no client-side persistence (no token in localStorage/cookies) — on refresh, it relies on Google Identity Services' silent re-auth (`prompt({auto_select:true})`); if multiple Google accounts are signed into the browser, Google forces an explicit account-picker click (a platform-level privacy constraint). The reason for not persisting: a stored token would mean a GM removed from the whitelist could keep working in an already-open tab until the token naturally expires; without persistence, a whitelist change takes effect the moment the page is refreshed.

**English demo (`/demo/`).** A public showcase version in English with the same flow as production, except: any Google account can use it (no whitelist), it calls `/demo-record` and `/demo-round`, copies `FirelessWar_Demo` instead of the production Template, and uses generic character names. Because it's open to everyone, its limits are tighter: `/demo-record` lookups and creations 10/hour each, `/demo-round` 10/minute (all global).

#### End-to-End Data Flow

GM signs in → enters a date/time → `GET /record` (with a Bearer token) looks up the session file → obtains a `spreadsheet_id` or creates one → intro page → clicks "正式開始!" → `GET /round` (with `spreadsheet_id` + Bearer token) batch-reads that round's full data in one call → frontend renders the charts and common-data panel → switching rounds via the bottom picker repeats the `GET /round` call.

#### Known Limitations

- The three global toggles (`oniwara_out`/`mike_out`/`kouno_single`) and the most severe "city economy collapse" warning tier have only been verified with synthetic test data, not yet exercised against real toggled game-sheet state.
- Whether the Final Day round (`FinalDayResult`) should get special display treatment is still undecided.
- `GET /round?spreadsheet_id=` does not validate that the given ID is a legitimately-created session file — any Sheet ID the Service Account can read would be attempted.
- Reading a session right after creating it may still return 404 and show the create dialog again: lookups use Drive's filename search, which takes a few seconds to see a new file. Retrying after a few seconds works.
