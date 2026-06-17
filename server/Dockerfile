# ── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install root workspace deps first (for shared/ etc.)
COPY package.json package-lock.json ./
COPY web/package.json ./web/
COPY admin/package.json ./admin/
COPY server/package.json ./server/
# shared is empty placeholder — create if missing
RUN mkdir -p shared && echo '{"name":"shared","version":"0.0.0"}' > shared/package.json

RUN npm ci --ignore-scripts

# Copy server source and build
COPY server/ ./server/
RUN cd server && npx nest build

# Prune devDependencies for production image
RUN cd server && npm prune --production 2>/dev/null || true

# ── Stage 2: Production ─────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./

USER appuser

EXPOSE 3000

CMD ["node", "dist/main.js"]
