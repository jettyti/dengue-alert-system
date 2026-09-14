# Build context must be the PROJECT ROOT (not server/), so this image can
# include index.html, barangay.html, rhu.html, config.js alongside the
# server code — server.js serves them via express.static(path.join(__dirname,'..')).
#
# Deploy from the project root with:
#   gcloud run deploy dengue-alert-server --source . --region asia-southeast1
# (Cloud Build picks up this Dockerfile automatically.)

FROM node:20-slim

WORKDIR /app

# Install server dependencies first (better layer caching)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy the static frontend files that server.js serves via express.static
COPY index.html barangay.html rhu.html config.js ./
# Copy the server code itself
COPY server ./server

# Cloud Run sets PORT automatically; server.js already reads it.
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server/server.js"]
