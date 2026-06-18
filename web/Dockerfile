# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root + web package files for npm ci
COPY package.json package-lock.json ./
COPY web/package.json ./web/

RUN npm ci --ignore-scripts

# Copy web source and build
COPY web/ ./web/
RUN cd web && npm run build

# ── Stage 2: Serve with nginx ───────────────────────────────────
FROM nginx:alpine

# Custom config: vue-router uses history mode, so we need SPA
# fallback (try_files ... /index.html) for deep links like
# /history, /generating/:id, /result/:id. nginx:alpine's stock
# config returns 404 for those.
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
