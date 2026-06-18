# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root + admin package files for npm ci
COPY package.json package-lock.json ./
COPY admin/package.json ./admin/

RUN npm ci --ignore-scripts

# Copy admin source and build
COPY admin/ ./admin/
RUN cd admin && npm run build

# ── Stage 2: Serve with nginx ───────────────────────────────────
FROM nginx:alpine

# Custom config: the main reverse proxy forwards /admin/... here
# with the prefix preserved. We rewrite it back to /... internally
# and provide SPA fallback (vue-router history mode).
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/admin/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
