# 部署指南 · PitchIntel → 公開網址（Railway 專攻）

目標：GitHub 有 repo + CI 綠燈 + Railway 出 `https://xxx.up.railway.app`

---

## 一鍵路線（Windows）

### 0. 安裝工具（只需一次）

```powershell
# GitHub CLI
winget install GitHub.cli

# 重新開一個 PowerShell 後：
gh auth login
# 選 GitHub.com → HTTPS → Login with browser

# Railway CLI（腳本也會自動 npm i -g）
npm install -g @railway/cli
```

### 1. 提交並推上 GitHub

```powershell
cd C:\Users\paula\pitch-intel
.\scripts\setup-and-push.ps1
```

成功後會有：`https://github.com/你的帳號/pitch-intel`

CI 會自動跑：`.github/workflows/ci.yml`（health + demo analyze）

### 2. 部署到 Railway 拿公開網址

**方法 A — 網頁（最穩，推薦）**

1. 開 https://railway.app → Login with GitHub  
2. **New Project** → **Deploy from GitHub repo** → 選 `pitch-intel`  
3. 等 Build / Deploy 完成  
4. 服務卡片 → **Settings** → **Networking** → **Generate Domain**  
5. 得到類似：`https://pitch-intel-production-xxxx.up.railway.app`

可選 Variables（Settings → Variables）：

| Key | Value |
|-----|--------|
| `DATA_PROVIDER` | `auto` |
| `API_FOOTBALL_KEY` | （可選） |
| `XAI_API_KEY` | （可選） |

**方法 B — CLI**

```powershell
cd C:\Users\paula\pitch-intel
.\scripts\deploy-railway.ps1
# 首次會 browser login
railway domain
railway open
```

### 3. 驗證公開站

```powershell
curl https://你的網域.up.railway.app/api/health
```

瀏覽器開首頁 → 撳 Demo 分析 → 切換 繁中/EN。

---

## 可選：GitHub Actions 自動 deploy

1. Railway → Account → Tokens → 建立 token  
2. GitHub repo → Settings → Secrets → Actions：  
   - `RAILWAY_TOKEN` = 個 token  
3. Push 到 `main` 會觸發 `.github/workflows/deploy-railway.yml`  
   （無 token 時呢個 job 會 skip）

---

## 手動 git（無 gh 時）

```powershell
cd C:\Users\paula\pitch-intel
git init -b main
git add -A
git commit -m "feat: PitchIntel v1.1"
# 去 github.com/new 建空 repo（不要加 README）
git remote add origin https://github.com/YOUR_USER/pitch-intel.git
git push -u origin main
```

---

## 故障排查

| 症狀 | 處理 |
|------|------|
| Build 失敗 | 睇 Railway Deploy Logs；確認 root 係 repo 根目錄 |
| Health fail | 確認 `PORT` 由平台注入（Express 已讀 `process.env.PORT`） |
| Chat WS 斷 | Railway 支援 WS；確認用 `wss://` 同站 domain |
| 冷啟動慢 | Free/trial 會 sleep；第一次開等 10–30s |
| CI 紅 | 開 GitHub Actions tab 睇 smoke log |

---

## 完成檢查清單

- [ ] `git push` 到 GitHub  
- [ ] Actions CI 全綠  
- [ ] Railway Deploy Success  
- [ ] Generate Domain  
- [ ] `/api/health` 回 `"ok": true`  
- [ ] 公開網址可以 Demo 分析  
