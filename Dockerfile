# Estágio 1: Build do Frontend (React)
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar dependências e instalar
COPY package*.json ./
RUN npm install

# Copiar código fonte e gerar o build
COPY . .
RUN npm run build

# Estágio 2: Ambiente de Produção (Node.js + Chromium para WhatsApp)
FROM node:18-slim

# Instalar Chromium e dependências necessárias para o Puppeteer
# Isso é essencial para o WhatsApp Web rodar dentro do Docker
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Configurar variáveis de ambiente para o Puppeteer usar o Chromium instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DATA_PATH=/app/data

# Copiar apenas os arquivos necessários para produção
COPY package*.json ./
RUN npm install --production

# Copiar o servidor backend
COPY server.js ./

# Copiar o build do frontend gerado no estágio anterior
COPY --from=builder /app/dist ./dist

# Criar diretório para persistência de dados (Banco de dados e Sessão WA)
RUN mkdir -p /app/data

# Ajustar permissões (opcional, mas recomendado)
RUN chown -R node:node /app

USER node

# Expor a porta usada pelo Express
EXPOSE 3000

# Iniciar o servidor
CMD ["npm", "start"]
