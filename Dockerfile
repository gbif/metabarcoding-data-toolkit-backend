FROM node:24.19.0-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund


FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=prod \
    NODE_OPTIONS=--enable-source-maps

RUN apt-get update \
    && apt-get install --no-install-recommends --yes \
       file \
       unzip \
       zip \
       ca-certificates \
       tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /app/config /app/data \
    && chown -R node:node /app

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

ENV PORT=9000
EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const net=require('net');const s=net.connect(9000,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),4000)"]

USER node

ENTRYPOINT ["/usr/bin/tini", "--", "node", "server/index.js"]
CMD []
