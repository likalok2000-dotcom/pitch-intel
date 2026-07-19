# 波析 AI · PitchIntel v1.1

賽事板 + 聊天室 + **AI 分析** + **真陣容 API** + **多語言** + **一鍵上線**。

> 研究／娛樂用途，**非博彩建議**。

## 快速啟動（本機）

```powershell
cd C:\Users\paula\pitch-intel
npm install
npm start
```

打開 **http://127.0.0.1:8866/**

### 環境變數

複製 `.env.example`（或直接在 shell 設定）：

| 變數 | 說明 |
|------|------|
| `PORT` | 預設 `8866`（雲端平台通常自動注入） |
| `DATA_PROVIDER` | `auto`（預設）/ `espn` / `apifootball` |
| `API_FOOTBALL_KEY` | [API-Football](https://www.api-football.com/) 真陣容／賽程 |
| `XAI_API_KEY` | [xAI Console](https://console.x.ai) Grok 敘事 |
| `XAI_MODEL` | 預設 `grok-4.5` |

```powershell
$env:API_FOOTBALL_KEY = "你的key"
$env:XAI_API_KEY = "你的key"
$env:DATA_PROVIDER = "auto"
npm start
```

## 1) 真陣容 / 數據 API

| 模式 | 行為 |
|------|------|
| **auto**（預設） | ESPN 賽事板 + snapshot；有 `API_FOOTBALL_KEY` 時嘗試補齊官方陣容 |
| **espn** | 只用 ESPN 公開 JSON（含 roster 解析） |
| **apifootball** | 賽程／陣容都走 API-Football（需 key） |

### 端點

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/health` | 健康 + provider 狀態 |
| GET | `/api/leagues` | 聯賽列表 |
| GET | `/api/matches?league=eng.1` | 賽事板 |
| GET | `/api/matches/:leagueId/:matchId` | 單場（含 lineups） |
| GET | `/api/lineups/:leagueId/:matchId` | **只取陣容／教練** |
| POST | `/api/analyze` | 完整 AI 分析流水線 |
| GET | `/api/demo` | 離線 demo |
| GET/POST | `/api/chat/:leagueId/:matchId` | 聊天 |
| WS | `/ws` | 即時聊天 |

## 2) 多語言

右上角切換：**繁中 (zh-HK)** · **EN** · **简中 (zh-CN)**  

選擇會存 `localStorage.pi_lang`。

## 3) 部署上線

### A. Docker（任意 VPS / NAS）

```bash
docker compose up -d --build
# http://YOUR_IP:8866
```

或：

```bash
docker build -t pitch-intel .
docker run -d -p 8866:8866 \
  -e API_FOOTBALL_KEY=xxx \
  -e XAI_API_KEY=xxx \
  --name pitch-intel pitch-intel
```

### B. Railway（推薦，支援 WebSocket）

1. 把 `pitch-intel` 推上 GitHub  
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub  
3. Root Directory 設 `pitch-intel`（若在 monorepo）  
4. Variables 加上 `API_FOOTBALL_KEY` / `XAI_API_KEY`（可選）  
5. Generate Domain  

`railway.toml` 已設定 healthcheck：`/api/health`

### C. Render

1. [render.com](https://render.com) → New → Blueprint → 連 repo  
2. 或 Web Service：Build `npm install`，Start `npm start`  
3. Health Check Path：`/api/health`  
4. 加 Environment Variables  

`render.yaml` 可直接用。

### D. Fly.io

```bash
cd pitch-intel
fly launch   # 或 fly deploy
fly secrets set API_FOOTBALL_KEY=xxx XAI_API_KEY=xxx
```

`fly.toml` 已綁 `internal_port = 8866` 與 health check。

### 部署注意

- **WebSocket 聊天**需要支援 WS 的平台（Railway / Render / Fly / 自架 Docker 都可以；純靜態 CDN 不行）。  
- 雲端會注入 `PORT`，本專案會自動讀取。  
- Free tier 會冷啟動，第一次開可能慢幾秒。

## 專案結構

```
pitch-intel/
  server/
    providers/
      index.js        # facade (auto/espn/apifootball)
      espn.js
      apifootball.js  # 真陣容
      lineups.js      # 正規化 XI
      demo.js
    engine/           # 分析 / 分析師 / 預測站 / Poisson
    ai/grok.js
    index.js
  web/
    js/i18n.js        # 多語言
    js/app.js
  Dockerfile
  docker-compose.yml
  render.yaml
  railway.toml
  fly.toml
  .env.example
```

## 免責

僅供數據分析與教育。不保證命中率。請遵守當地法律與各 API 服務條款。
