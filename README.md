# fireless-war

願浮沉2:無火戰爭 —— 專案總覽 repo,透過 git submodule 把各子系統掛在一起,方便一次 clone 齊全部程式碼。

這個 repo 本身**不會被部署**——各子系統各自連到自己的 repo 做部署(見下表),這裡純粹是本機開發時的統一入口。

## 子系統

| 子系統 | Repo | 部署 |
|---|---|---|
| 後端 API | [`fireless-war-backend`](https://github.com/beethoreven/fireless-war-backend) | Render(`https://fireless-war-backend.onrender.com`) |
| 前端網站 | [`fireless-war-web`](https://github.com/beethoreven/fireless-war-web) | GitHub Pages(從 repo 根目錄) |

未來會加入的子系統(DB、mobile)用同樣方式以 `git submodule add` 掛進來。

## 使用方式

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

最後這個 `git add` + `commit` 不能省略——沒做的話,子模組本機檔案雖然是新的,但這個 wrapper repo 記錄的「該指向哪個 commit」還是舊的,別人 clone 這個 repo 還是會抓到舊版本。
