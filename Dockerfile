# API container for Google Cloud Run (built by Cloud Build). Build context = repo root.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY supabase ./supabase
# Install only the API workspace and the workspace packages it imports (not the Next.js web app).
RUN npm ci -w @projectx/api --omit=dev --ignore-scripts --legacy-peer-deps
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@projectx/api"]
