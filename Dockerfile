FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.server.json tsconfig.json ./
COPY vite.config.ts index.html postcss.config.js ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/lifeline.sqlite

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

RUN mkdir -p /app/data/backups \
  && chown -R node:node /app/data
VOLUME ["/app/data"]
EXPOSE 3001

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health/ready').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "dist-server/index.js"]
