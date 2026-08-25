FROM node:24.15-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/data/saldo-real.db
EXPOSE 3000

CMD ["node", "src/server.js"]
