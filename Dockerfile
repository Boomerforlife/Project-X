# API container for Google Cloud Run (built by Cloud Build). Build context = repo root.
# Stage 1: install with dev deps and bundle the API to plain JS (no TypeScript compile at container start).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY supabase ./supabase
RUN npm ci -w @projectx/api --ignore-scripts --legacy-peer-deps && npm run build -w @projectx/api

# Stage 2: production deps only + the bundle.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci -w @projectx/api --omit=dev --ignore-scripts --legacy-peer-deps && npm cache clean --force
COPY --from=build /app/apps/api/dist ./apps/api/dist
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "--enable-source-maps", "apps/api/dist/server.mjs"]
