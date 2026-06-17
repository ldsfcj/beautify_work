# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install root workspace deps
COPY package.json package-lock.json ./
COPY admin/package.json ./admin/
RUN mkdir -p shared && echo '{"name":"shared","version":"0.0.0"}' > shared/package.json
RUN npm ci --ignore-scripts

# Copy admin source and build
COPY admin/ ./admin/
RUN cd admin && npm run build

# ── Stage 2: Serve with nginx ───────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/admin/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
