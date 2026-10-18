# Deployment guide

This document covers deploying REA Studio to a free or low-cost host. Pick the platform that matches which target types you want to analyze.

## TL;DR — pick a platform

| Target types you want | Recommended platform | Why |
|---|---|---|
| **Websites only** | [fly.io](#flyio-websites-only-free-tier) | Free tier covers a 1GB persistent VM; Node-only, no Java needed |
| **Websites + APK** | [Oracle Cloud Always-Free ARM](#oracle-cloud-always-free-full-analysis) | 24GB RAM VM is free forever; lets you install JDK + JADX |
| **Websites + APK + binary** | [Oracle Cloud Always-Free ARM](#oracle-cloud-always-free-full-analysis) | Same as above; Ghidra needs the RAM |
| **Just want easiest setup** | [Railway](#railway-easiest-setup) | `$5 free credit/mo` covers a hobby instance; one-click deploy |
| **Vercel** | ❌ **Does not work** | Hobby tier has 10s function timeout; REA analysis takes minutes |

The runner is **in-process** (lives inside Next.js), so the host must:
1. Allow long-lived HTTP requests (no serverless function timeouts)
2. Allow spawning child processes (`rea` CLI)
3. Have a writable filesystem for SQLite + uploads

Vercel/Netlify/Cloudflare Pages fail requirement (1). Use a VM-based host.

---

## fly.io (websites-only, free tier)

fly.io gives you 3 shared-CPU 1GB VMs free forever. REA Studio fits in one.

### Prerequisites

- [fly.io account](https://fly.io/app/sign-up) (free, no credit card)
- [`flyctl` CLI installed](https://fly.io/docs/hands-on/install-flyctl/)

### Steps

```bash
# 1. From the repo root:
fly launch --no-deploy

# When prompted:
#   - Pick an app name (e.g. rea-studio-YOURNAME)
#   - Choose a region near you
#   - "Would you like to set up a Postgresql database?" → No (we use SQLite)
#   - "Would you like to set up a Redis database?" → No
#   - "Deploy now?" → No (we'll configure env vars first)

# 2. Create a persistent volume for SQLite + uploads (so data survives redeploys)
fly volumes create rea_studio_data --size 1

# 3. Set env vars
fly secrets set ZAI_API_KEY=your_key_here
# DATABASE_URL stays as file:./db/custom.db — that's intentional
# Mount the volume so the SQLite DB + uploads persist across redeploys
# (already in fly.toml if you used `fly launch`)

# 4. Deploy
fly deploy

# 5. Open it
fly open
```

### Caveats

- **1GB RAM is enough for websites.** APK analysis with JADX needs 1–2GB; binary analysis with Ghidra needs 2–4GB. Don't enable those target types on fly.io.
- **Cold starts:** fly.io's free tier sleeps idle VMs after ~5min. First request after sleep takes ~5s extra. Acceptable for single-user use; for production add `auto_stop_machines = false` in `fly.toml` (costs free-tier quota faster).
- **`npx` first-run penalty:** if `rea` is not globally installed, the runner spawns `npx -y rea-agents@latest` which downloads the package on first use. To avoid this, bake `npm install --global rea-agents` into the Dockerfile.

---

## Oracle Cloud Always-Free (full analysis)

Oracle's Always-Free tier includes a 4 vCPU / 24GB RAM ARM VM that's free forever. This is the only free option that fits Ghidra + JADX memory requirements.

### Prerequisites

- [Oracle Cloud account](https://signup.cloud.oracle.com/) (free, credit card for verification only)
- SSH key pair

### Steps

1. **Create an A1.Flex ARM instance:**
   - Shape: `VM.Standard.A1.Flex`
   - OCPUs: 4, Memory: 24 GB
   - Image: Canonical Ubuntu 22.04 (or newer)
   - Add a 50GB boot volume
   - Save the SSH private key

2. **SSH in and install dependencies:**
   ```bash
   ssh ubuntu@<instance-public-ip>

   # Install Node 22 via nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
   source ~/.bashrc
   nvm install 22

   # Install Bun (faster than npm for this project)
   curl -fsSL https://bun.sh/install | bash
   source ~/.bashrc

   # Install JDK 17 (required by JADX + Ghidra)
   sudo apt update
   sudo apt install -y openjdk-17-jdk
   java -version

   # Install Ghidra (for binary analysis)
   # Download from https://github.com/NationalSecurityAgency/ghidra/releases
   # Extract to /opt/ghidra and add to PATH

   # Install JADX (for APK analysis)
   # Download from https://github.com/skylot/jadx/releases
   # Extract to /opt/jadx and add to PATH

   # Install rea globally
   npm install --global rea-agents
   rea --version
   ```

3. **Clone + run REA Studio:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/rea-studio.git
   cd rea-studio
   bun install
   cp .env.example .env
   bun run db:push

   # Run on port 3000 in the background
   bun run build
   nohup bun run start > rea-studio.log 2>&1 &
   ```

4. **Enable APK / binary targets:**
   ```bash
   # Edit src/lib/runner.ts and flip enabled: true for apk and binary
   nano src/lib/runner.ts
   # Then rebuild:
   bun run build
   ```

5. **Expose it via a reverse proxy (optional):**
   - Oracle Cloud's free instances get a public IP. Browse directly to `http://<instance-ip>:3000`.
   - For HTTPS + a real domain, install Caddy:
     ```bash
     sudo apt install -y caddy
     sudo nano /etc/caddy/Caddyfile
     # Add:
     #   your-domain.com {
     #     reverse_proxy localhost:3000
     #   }
     sudo systemctl reload caddy
     ```
   - Open Oracle Cloud's security list: **Networking → Virtual Cloud Networks → Security List Rules → Ingress**, allow TCP 80/443 from 0.0.0.0/0.

### Caveats

- **Always-Free quota:** 4 vCPU ARM is the entire free CPU quota per tenancy. Don't create multiple instances.
- **Idle instances are NOT reclaimed** (Oracle changed this policy in 2024 — your VM stays up forever as long as you don't exceed free quota).
- **APT installs on ARM:** most packages work natively; some Ghidra plugins may not.

---

## Railway (easiest setup)

Railway gives you $5 of free credit per month, which covers a small persistent VM. No free tier after that — it's pay-as-you-go.

### Steps

```bash
# 1. Push the repo to GitHub (see below)

# 2. Go to https://railway.app/new
# 3. Pick "Deploy from GitHub repo"
# 4. Select your rea-studio repo
# 5. Railway auto-detects Next.js — accept the defaults
# 6. Add env vars: ZAI_API_KEY, REA_UPLOAD_DIR=/data/uploads
# 7. Add a persistent volume: mount /data (1GB free, $0.25/GB after)
# 8. Deploy
```

### Caveats

- Free credit ($5/mo) covers ~500 hours of a 512MB VM. Enough for part-time single-user use.
- APK / binary analysis needs the 2GB+ plan, which exceeds the free credit. Switch to Oracle Cloud for those target types.

---

## Pre-deploy checklist

Before deploying, run through this checklist:

- [ ] `bun run lint` passes with no errors
- [ ] `./scripts/smoke-test.sh` passes locally against `bun run dev`
- [ ] `.env` has `ZAI_API_KEY` set (or you've accepted the deterministic fallback)
- [ ] `REA_UPLOAD_DIR` is set to a writable path (and mounted as a persistent volume on the host)
- [ ] `rea --version` works on the host (or you've accepted the `npx` fallback)
- [ ] If enabling APK/binary: JDK 17 + JADX/Ghidra installed and on PATH
- [ ] `src/lib/runner.ts` `COMMAND_BY_TARGET` has the right `enabled` flags

---

## Post-deploy verification

After deploying, verify the dashboard works end-to-end:

1. Visit `https://your-app.example.com/`
2. Click the **Settings** tab. The "Worker status" panel should show "ready".
3. Submit a website URL (e.g. `https://example.com`).
4. Watch the live log stream. After ~15s, the job should complete with 5 findings.
5. Click "Generate report" → verify the markdown renders in the Reports tab.

If anything fails:

- **Settings shows "offline":** the in-process runner didn't start. Check `rea-studio.log` (or your host's logs) for startup errors.
- **Job stuck at 0%:** the `rea` CLI failed to spawn. Check that `rea --version` works in the host's shell, and that the Next.js process has permission to spawn child processes.
- **Job fails with "command not found":** set `reaBinaryPath` in Settings to the absolute path of `rea` (e.g. `/usr/local/bin/rea`).
- **Report generation returns 500:** `ZAI_API_KEY` is not set or invalid. The deterministic fallback should kick in; if not, check the API route's error log.

---

## Scaling out (multi-user / distributed)

The default deployment is single-user — one Next.js process, one SQLite file, one `rea` invocation at a time. If you outgrow that:

1. **Switch to Postgres.** Change `DATABASE_URL` in `.env` to `postgresql://...`. Prisma handles the migration:
   ```bash
   bunx prisma migrate dev --name switch-to-postgres
   ```
   Make sure every `db.*` call still works (it should — Prisma is DB-agnostic at the application layer).

2. **Add NextAuth.** NextAuth.js v4 is already in `package.json`. Add a `src/app/api/auth/[...nextauth]/route.ts` with your preferred provider (GitHub, Google, email, etc.) and protect the `/api/jobs` POST routes with `getServerSession`.

3. **Move the runner to a separate worker process.** Extract `src/lib/runner.ts` into its own service (e.g. using BullMQ + Redis) so the Next.js process doesn't hold open child processes per request. This is necessary if you want to scale Next.js horizontally.

4. **Per-user upload quotas.** Track upload sizes per user in the AuditLog table; reject uploads that exceed a per-user limit.

These are all out of scope for the default single-user deploy — but the codebase is structured so they're additive, not breaking.
