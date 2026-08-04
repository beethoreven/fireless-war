# fireless-war

## 中文

「願浮沉2:無火戰爭」專案總覽 repo,透過 git submodule 把各子系統掛在一起,方便一次 `clone` 齊全部程式碼。這個 repo 本身**不會被部署**——各子系統各自連到自己的 repo 做部署(見下表),這裡純粹是本機開發時的統一入口。各子系統的技術細節、架構決策,請見各自 repo 的 README(尤其是 [`fireless-war-backend`](https://github.com/beethoreven/fireless-war-backend) 裡完整的專案報告)。

### 子系統

| 子系統 | Repo | 部署 |
|---|---|---|
| 後端 API | [`fireless-war-backend`](https://github.com/beethoreven/fireless-war-backend) | Render(`https://fireless-war-backend.onrender.com`) |
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
cd fireless-war-backend   # 或 fireless-war-web
git pull origin main
cd ..
git add fireless-war-backend
git commit -m "Update fireless-war-backend submodule pointer"
```

最後這個 `git add` + `commit` 不能省略——沒做的話,子模組本機檔案雖然是新的,但這個 wrapper repo 記錄的「該指向哪個 commit」還是舊的,別人 `clone` 這個 repo 還是會抓到舊版本。

---

## English

The project-overview repo for *Fireless War 2*, wiring its subsystems together via git submodules so the whole codebase can be pulled with a single `clone`. This repo itself **is never deployed** — each subsystem connects to its own repo for deployment (see the table below); this one is purely a unified local-dev entry point. For technical details and architecture decisions, see each subsystem's own README (especially the full project report in [`fireless-war-backend`](https://github.com/beethoreven/fireless-war-backend)).

### Subsystems

| Subsystem | Repo | Deployment |
|---|---|---|
| Backend API | [`fireless-war-backend`](https://github.com/beethoreven/fireless-war-backend) | Render (`https://fireless-war-backend.onrender.com`) |
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
cd fireless-war-backend   # or fireless-war-web
git pull origin main
cd ..
git add fireless-war-backend
git commit -m "Update fireless-war-backend submodule pointer"
```

That final `git add` + `commit` cannot be skipped — without it, the submodule's local files are up to date, but this wrapper repo's recorded "which commit to point at" is still stale, so anyone else who `clone`s this repo will still get the old version.
