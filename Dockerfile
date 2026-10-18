# Dockerfile for REA Studio.
#
# Used by:
#   - fly.io (auto-detected by `fly launch`)
#   - any Docker-compatible host (fly.io, Railway, self-hosted)
#
# Multi-stage build:
#   1. deps:    install node_modules
#   2. builder: build the Next.js standalone output
#   3. runner:  minimal runtime image with rea CLI pre-installed
#
# The runner image includes `rea-agents` globally so the in-process runner
# can spawn it without paying the `npx` first-run penalty.

# ── Stage 1: deps ────────────────────────────────────────────────────────
FROM oven/bun:1.3 AS deps
WORKDIR /app

# Copy lockfile + manifests first for cache reuse
COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install deps (use --frozen-lockfile in CI; omit for first-time local builds)
RUN bun install --frozen-lockfile || bun install

# ── Stage 2: builder ─────────────────────────────────────────────────────
FROM oven/bun:1.3 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the standalone Next.js output
RUN bun run build

# ── Stage 3: runner ──────────────────────────────────────────────────────
FROM oven/bun:1.3 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install rea CLI globally so the runner doesn't pay `npx` startup cost
RUN npm install --global rea-agents || echo "rea install failed — will fall back to npx at runtime"

# Create a non-root user for safety
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy the standalone build + public assets + Prisma schema
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

# Create the uploads directory (mounted as a volume on fly.io)
RUN mkdir -p /data/uploads /app/uploads && \
    chown -R nextjs:nodejs /data /app/uploads

# Default env vars (overridable at runtime via -e or fly secrets)
ENV DATABASE_URL=file:/data/db/custom.db
ENV REA_UPLOAD_DIR=/data/uploads

USER nextjs

EXPOSE 3000

# Run the standalone Next.js server
CMD ["node", "server.js"]
