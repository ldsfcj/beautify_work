# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install root workspace deps
COPY package.json package-lock.json ./
COPY web/package.json ./web/
RUN mkdir -p shared && echo '{"name":"shared","version":"0.0.0"}' > shared/package.json
RUN npm ci --ignore-scripts

# Copy web source and build
COPY web/ ./web/
RUN cd web && npm run build

# ── Stage 2: Serve with nginx ───────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
