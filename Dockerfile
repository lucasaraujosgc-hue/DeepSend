# Estágio 1: Build do Frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Estágio 2: Produção (Alpine + Chromium)
FROM node:18-alpine

# Instalar Chromium e dependências do Puppeteer no Alpine
# Alpine é muito mais leve que o Debian/Ubuntu, economizando espaço em disco
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

# Configurar Variáveis de Ambiente para o Puppeteer não baixar o Chrome duplicado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DATA_PATH=/app/data

# Copiar dependências e instalar apenas as de produção
COPY package*.json ./
RUN npm install --production

# Copiar arquivos do servidor e do frontend buildado
COPY server.js ./
COPY --from=builder /app/dist ./dist

# Criar diretório de dados
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["npm", "start"]
