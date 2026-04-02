# ── electron-build ─────────────────────────────────────────
FROM electronuserland/builder:22-wine AS electron-builder
# @jitsi/robotjs compiles against X11/libpng on Linux (postinstall runs electron-builder install-app-deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxtst-dev \
    libx11-dev \
    libpng++-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json ./
RUN npm install
COPY . .
# Build Windows and Linux apps. Wine + NSIS is very RAM-heavy; a large Node heap
# can push the whole build over Docker's cgroup limit (ResourceExhausted / cannot
# allocate memory). Cap heap and limit parallel npm scripts; split RUN so the OS
# can reclaim between targets.
#
# If it still OOMs: raise Docker Desktop → Settings → Resources → Memory, or skip
# Windows here and produce the .exe on a Windows runner / larger machine:
#   docker build --build-arg SKIP_WIN_BUILD=1 -f docs/Dockerfile ..
ARG SKIP_WIN_BUILD=0
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV npm_config_jobs=1
RUN if [ "$SKIP_WIN_BUILD" != "1" ]; then npm run build:win; fi
RUN npm run build:linux

# ── docs-deps ──────────────────────────────────────────────
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY docs/package.json ./
RUN npm install --ignore-scripts

# ── docs-build ─────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY docs/ .

# Extract built desktop apps
RUN mkdir -p public/downloads
COPY --from=electron-builder /workspace/dist/ /tmp/dist/
RUN find /tmp/dist -name "*.exe" -exec cp {} public/downloads/OpenCowork-Windows-Setup.exe \; || true
RUN find /tmp/dist -name "*.AppImage" -exec cp {} public/downloads/OpenCowork.AppImage \; || true
RUN find /tmp/dist -name "*.deb" -exec cp {} public/downloads/OpenCowork.deb \; || true

RUN npm rebuild esbuild lightningcss
RUN npm run postinstall
RUN npm run build

# ── runner ────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
