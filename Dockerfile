# Estágio 1: Build do Frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Instala dependências (incluindo devDependencies para o build)
RUN npm install
COPY . .
RUN npm run build

# Estágio 2: Produção (Alpine + Chromium)
FROM node:18-alpine

# Instala o Chromium do sistema (muito mais leve que baixar pelo npm)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn

WORKDIR /app

# Variáveis para usar o Chromium do sistema e não baixar duplicado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DATA_PATH=/app/data

# Copia package.json
COPY package*.json ./

# Instala apenas dependências de produção (agora usa puppeteer-core, economizando espaço)
RUN npm install --production

# Copia servidor e frontend buildado
COPY server.js ./
COPY --from=builder /app/dist ./dist

# Cria diretórios necessários
RUN mkdir -p /app/data/whatsapp_auth && \
    mkdir -p /app/data/uploads && \
    chown -R node:node /app

USER node
EXPOSE 3000
CMD ["npm", "start"]