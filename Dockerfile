FROM oven/bun:1.4.2-slim AS dependencies

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-slim AS runtime

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY lib ./lib

ENV NODE_ENV=production

RUN mkdir /app/assets && chown bun:bun /app/assets

VOLUME ["/app/assets"]

USER bun

CMD ["bun", "start"]
