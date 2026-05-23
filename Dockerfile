# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

# Install deps (including dev for tsc).
COPY package.json package-lock.json ./
RUN npm ci

# Compile TS -> dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production deps only.
RUN npm prune --omit=dev

# --- runtime stage ---
FROM node:22-alpine
WORKDIR /app

# Run as non-root.
RUN addgroup -S app && adduser -S app -G app

# Copy compiled output and pruned node_modules.
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
# Migrations are read at runtime by `npm run db:migrate`.
COPY --from=build --chown=app:app /app/src/db/migrations ./dist/db/migrations

USER app
EXPOSE 4000

# Health probe convention: orchestrator should hit /health.
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
