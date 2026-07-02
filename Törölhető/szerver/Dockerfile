FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
RUN npx playwright install chromium

COPY . .

RUN node tools/init-server-data.js || true

ENV DIVIAN_SERVER_MODE=1
ENV DIVIAN_BIND_HOST=0.0.0.0
ENV DIVIAN_STATIC_PORT=17321
ENV DIVIAN_OPEN_BROWSER=0
ENV DIVIAN_PLAYWRIGHT_NO_CHANNEL=1
ENV DIVIAN_ORDER_MIRROR_OFF=1
ENV DIVIAN_DATA_ROOT=/data/divian

EXPOSE 17321

VOLUME ["/data/divian"]

CMD ["node", "divian-static-server.js"]
