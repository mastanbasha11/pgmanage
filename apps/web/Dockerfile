# ── Builder stage: produces /app/dist ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /repo

# Copy workspace manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --include=dev

# Copy the rest of the workspace (only what's needed for the web build)
COPY tsconfig*.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# Vite build — `VITE_*` env vars are baked in at build time
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace=apps/web

# ── Final stage: just the static files (Caddy will serve these) ──────────────
FROM busybox:1.36 AS dist
WORKDIR /dist
COPY --from=builder /repo/apps/web/dist ./
CMD ["true"]
