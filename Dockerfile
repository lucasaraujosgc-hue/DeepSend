# Estágio 1: Construção (Build)
FROM node:18-alpine AS builder

WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia todo o restante do código fonte
COPY . .

# Executa o build da aplicação (Gera a pasta 'dist')
RUN npm run build

# Estágio 2: Servidor de Produção (Nginx)
FROM nginx:alpine

# Remove a configuração padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia nossa configuração personalizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos gerados no build para o Nginx
# O Vite gera os arquivos na pasta 'dist'
COPY --from=builder /app/dist /usr/share/nginx/html

# Expõe a porta 80
EXPOSE 80

# Inicia o Nginx
CMD ["nginx", "-g", "daemon off;"]