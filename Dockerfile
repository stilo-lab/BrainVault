FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY scripts ./scripts
COPY assets ./assets
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh
RUN mkdir -p /app/data && chown -R node:node /app
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
