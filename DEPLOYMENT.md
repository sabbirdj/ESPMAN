# ESP Device Manager — Deployment Guide

This guide covers deploying the ESP Device Manager to any VPS (AWS EC2, Oracle Cloud, Fly.io, DigitalOcean, etc.) with **Turso** as the database.

## Architecture

```
   Real ESP (running firmware)
        │
        │  WebSocket to port 3004 (raw WS, JSON over text frames)
        ▼
   ┌─────────────────────────────────────────────┐
   │  Your VPS (AWS / Oracle / Fly.io / etc.)    │
   │                                              │
   │  ┌─────────────────┐  ┌──────────────────┐  │
   │  │  Next.js app    │  │  device-service  │  │
   │  │  (port 3000)    │  │  port 3003: dash │  │
   │  │  - Dashboard UI │  │  port 3004: ESPs │  │
   │  │  - REST API     │  │  (Socket.io + WS)│  │
   │  └────────┬────────┘  └────────┬─────────┘  │
   │           │                     │            │
   │           └──────────┬──────────┘            │
   │                      ▼                       │
   │           Turso (libSQL cloud DB)            │
   │           esp-manager-xxx.turso.io           │
   └─────────────────────────────────────────────┘
        ▲
        │  HTTPS (dashboard + Socket.io via reverse proxy)
        │
   Browser (dashboard)
```

**Why Turso?** It's SQLite-based, so your Prisma schema works unchanged. It's serverless (no DB server to manage), has a generous free tier (500 DBs, 9GB total, 1 billion reads/month), and edges close to your users.

---

## Step 1 — Set up Turso

### 1.1 Install the Turso CLI

```bash
# macOS / Linux
curl -sSfL https://get.tur.so/install.sh | bash

# Verify
turso --version
```

### 1.2 Sign up and create a database

```bash
# Sign up (free — no credit card needed)
turso auth signup

# Create your database
turso db create esp-manager

# Wait for it to be ready
turso db show esp-manager
```

### 1.3 Get your credentials

```bash
# Get the database URL
turso db show esp-manager --url
# → libsql://esp-manager-<your-org>.turso.io

# Create an access token
turso db tokens create esp-manager
# → eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

Save both of these — you'll put them in your `.env` file.

### 1.4 (Optional) Inspect your database

```bash
# Open a SQL shell
turso db shell esp-manager

# List tables (after you run db:push later)
.tables
```

---

## Step 2 — Push the schema to Turso

From your local machine (or wherever you have the project code):

```bash
# Set the Turso credentials as environment variables
export DATABASE_URL="libsql://esp-manager-<your-org>.turso.io"
export TURSO_AUTH_TOKEN="eyJhbGciOi..."

# Push the Prisma schema to Turso
bun run db:push

# Seed the firmware library (does NOT create fake devices)
curl -X POST http://localhost:3000/api/seed
# Or after deploy: curl -X POST https://your-domain.com/api/seed
```

Verify in the Turso shell:
```bash
turso db shell esp-manager
> .tables
Device  Firmware  TelemetryLog
> SELECT COUNT(*) FROM Firmware;
8
```

---

## Step 3 — Deploy to a VPS

Pick ONE of the following providers. All work with Turso.

### Option A — Oracle Cloud Always Free (recommended, free forever)

1. **Sign up** at [cloud.oracle.com](https://cloud.oracle.com) (needs credit card for verification, won't be charged)

2. **Create an Always Free instance:**
   - Shape: `VM.Standard.A1.Flex` (Ampere ARM, up to 4 cores / 24GB RAM — always free)
   - Image: Ubuntu 22.04 (or Canonical Ubuntu 22.04)
   - Add SSH keys (generate or upload your own)
   - Wait ~5 min for provisioning

3. **Open ports in the security list:**
   - VCN → Security Lists → Ingress Rules
   - Add rules for ports: **80** (HTTP), **443** (HTTPS), **3004** (ESP WebSocket)
   - Source: `0.0.0.0/0`

4. **SSH in and install dependencies:**
   ```bash
   ssh ubuntu@<your-instance-public-ip>

   # Install Node.js + Bun
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   curl -fsSL https://bun.sh/install | bash
   source ~/.bashrc

   # Install Caddy (reverse proxy with auto-HTTPS)
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install caddy
   ```

5. **Clone and build the project:**
   ```bash
   git clone <your-repo-url> esp-manager
   cd esp-manager
   bun install
   bun run build
   ```

6. **Configure environment:**
   ```bash
   cp .env.example .env
   nano .env
   # Set:
   #   DATABASE_URL=libsql://esp-manager-<your-org>.turso.io
   #   TURSO_AUTH_TOKEN=eyJhbGciOi...
   ```

7. **Start the services with PM2 (process manager):**
   ```bash
   sudo npm install -g pm2

   # Start Next.js (port 3000)
   pm2 start "bun run start" --name esp-dashboard

   # Start device-service (ports 3003 + 3004)
   pm2 start "bun run dev" --name esp-device-service --cwd mini-services/device-service

   # Save and auto-restart on reboot
   pm2 save
   pm2 startup
   ```

8. **Configure Caddy (auto-HTTPS reverse proxy):**
   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```
   Replace with:
   ```
   your-domain.com {
       reverse_proxy localhost:3000
   }

   # ESP WebSocket bridge (no HTTPS — ESP firmware uses ws:// not wss://)
   :3004 {
       reverse_proxy localhost:3004
   }
   ```
   ```bash
   sudo systemctl restart caddy
   ```

9. **Point your domain** to the instance's public IP (A record in your DNS provider).

10. **Update the ESP firmware** with your domain:
    ```cpp
    const char* SERVER_HOST = "your-domain.com";
    const uint16_t SERVER_PORT = 3004;
    ```

### Option B — Fly.io (free tier, containerized)

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   flyctl auth signup
   ```

2. **Create a `Dockerfile`** at the project root:
   ```dockerfile
   FROM oven/bun:1.1 AS base
   WORKDIR /app

   # Install dependencies
   COPY package.json bun.lockb ./
   COPY mini-services/device-service/package.json ./mini-services/device-service/
   RUN bun install

   # Copy source
   COPY . .

   # Build Next.js
   RUN bun run build

   # Install device-service deps
   RUN cd mini-services/device-service && bun install

   # Expose ports
   EXPOSE 3000 3003 3004

   # Start script (runs both Next.js and device-service)
   COPY start.sh ./
   RUN chmod +x start.sh
   CMD ["./start.sh"]
   ```
   Create `start.sh`:
   ```bash
   #!/bin/bash
   # Start device-service in background
   cd /app/mini-services/device-service && bun run index.ts &
   # Start Next.js in foreground
   cd /app && bun run start
   ```

3. **Launch on Fly:**
   ```bash
   fly launch --no-deploy
   # Edit fly.toml to add:
   #   [http_service]
   #     internal_port = 3000
   #   [[services.ports]]
   #     port = 3004
   #     handlers = ["tls", "tcp"]
   #     [services.ports.tls_options]
   #       alpn = ["http/1.1"]

   fly secrets set DATABASE_URL="libsql://esp-manager-xxx.turso.io"
   fly secrets set TURSO_AUTH_TOKEN="eyJhbGciOi..."

   fly deploy
   ```

4. **Get your app URL:**
   ```bash
   fly apps show
   # → esp-manager.fly.dev
   ```

5. **Update ESP firmware:**
   ```cpp
   const char* SERVER_HOST = "esp-manager.fly.dev";
   const uint16_t SERVER_PORT = 3004;
   ```

### Option C — AWS EC2 Free Tier (12 months free)

Same as Oracle Cloud but:

1. Sign up at [aws.amazon.com](https://aws.amazon.com)
2. Launch a **t2.micro** instance (1 vCPU, 1GB RAM — enough for this project)
3. Use **Amazon Linux 2** or **Ubuntu 22.04** AMI
4. Create a security group with inbound rules:
   - Port 22 (SSH) — your IP only
   - Port 80 (HTTP) — 0.0.0.0/0
   - Port 443 (HTTPS) — 0.0.0.0/0
   - Port 3004 (ESP WebSocket) — 0.0.0.0/0
5. Allocate an **Elastic IP** and associate it with the instance (free while attached)
6. SSH in and follow the same steps as Option A (Oracle Cloud)
7. **⚠️ Set a billing alert:** AWS Billing → Billing Preferences → enable billing alerts, set a $1 threshold

---

## Step 4 — Configure the ESP firmware

Once your server is running, update the firmware config (`firmware/esp-manager.ino`):

```cpp
// For Oracle Cloud / AWS / DigitalOcean with a domain:
const char* SERVER_HOST = "your-domain.com";
const uint16_t SERVER_PORT = 3004;

// For a VPS without a domain (use the public IP):
const char* SERVER_HOST = "123.45.67.89";
const uint16_t SERVER_PORT = 3004;

// For Fly.io:
const char* SERVER_HOST = "esp-manager.fly.dev";
const uint16_t SERVER_PORT = 3004;
```

Flash the firmware → ESP boots → connects to your server → auto-registers → appears on dashboard.

---

## Step 5 — Verify the deployment

1. **Open the dashboard:** `https://your-domain.com`
2. **Check the health endpoint:** `https://your-domain.com/api/health` (should return `{"ok":true}`)
   - Actually, there's no `/api/health` — check `https://your-domain.com/api/stats`
3. **Check the ESP bridge:** `curl http://your-domain.com:3004/health`
   - Should return: `{"ok":true,"bridge":"esp","realEspsConnected":0,"dashboardsConnected":0}`
4. **Flash an ESP** → it should appear on the dashboard within 5 seconds of booting

---

## Troubleshooting

### ESP won't connect
- Verify the ESP can reach your server: from the ESP's serial monitor, check the Wi-Fi connection and the WebSocket URL
- Check the server firewall allows port 3004 inbound
- Check `curl http://your-server-ip:3004/health` works from your laptop
- The ESP firmware only supports 2.4 GHz Wi-Fi — it won't see 5 GHz networks

### Dashboard loads but no devices appear
- Make sure you ran `bun run db:push` with the Turso credentials set
- Check the browser console for socket.io connection errors
- Verify the device-service is running: `pm2 status` or `ps aux | grep bun`

### Database errors
- Verify `DATABASE_URL` starts with `libsql://` (not `file:`) in production
- Verify `TURSO_AUTH_TOKEN` is set and valid
- Test the connection: `turso db shell esp-manager` → `.tables`

### ESP connects but immediately disconnects
- Check the device-service logs: `pm2 logs esp-device-service`
- The ESP's MAC address must be unique — if two ESPs have the same MAC, they'll kick each other off
- The ESP firmware auto-reconnects every 5 seconds, so brief disconnects are normal

---

## Cost summary

| Provider | Free tier | After free tier | Best for |
|----------|-----------|-----------------|----------|
| **Turso** | 500 DBs, 9GB, 1B reads/month — **free forever** | $0.25/million reads | Hobby projects, always free |
| **Oracle Cloud** | 4-core ARM VM — **free forever** | $0 (always free) | Long-term deployment |
| **AWS EC2** | t2.micro for 12 months | ~$8-10/month | Short-term, managed Postgres |
| **Fly.io** | 3 shared VMs, 256MB each | $0.50/GB/month overage | Containerized, easy deploy |

**Cheapest long-term setup:** Turso (free) + Oracle Cloud (free) = **$0/month forever**
