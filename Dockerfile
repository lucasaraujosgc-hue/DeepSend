# Estágio 1: Build do Frontend e Dependências
FROM node:18-alpine AS builder
WORKDIR /app

# Instala ferramentas necessárias para compilar módulos nativos (sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Instala todas as dependências (incluindo dev e nativas)
RUN npm install

COPY . .

# Build do Frontend (Vite)
RUN npm run build

# Estágio 2: Produção (Alpine + Chromium)
FROM node:18-alpine

# Instala o Chromium do sistema (para o whatsapp-web.js/puppeteer-core)
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

# Variáveis para usar o Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DATA_PATH=/app/data

# Copia package.json
COPY package*.json ./

# Copia as dependências já instaladas/compiladas do estágio anterior
# Isso evita o erro de falta de Python no estágio final
COPY --from=builder /app/node_modules ./node_modules

# Copia servidor e frontend buildado
COPY server.js ./
COPY --from=builder /app/dist ./dist

# Cria diretórios necessários e ajusta permissões
RUN mkdir -p /app/data/whatsapp_auth && \
    mkdir -p /app/data/uploads && \
    chown -R node:node /app

USER node
EXPOSE 3000
CMD ["npm", "start"]
