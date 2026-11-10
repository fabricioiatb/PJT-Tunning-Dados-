# 1) Build do React com Vite. As URLs das APIs entram no bundle no build:
#    são acessadas pelo NAVEGADOR, por isso usam localhost (portas publicadas).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_CLIENTES_API_URL=http://localhost:3001
ARG VITE_GARAGENS_API_URL=http://localhost:3002
ARG VITE_SESSOES_API_URL=http://localhost:3003
RUN npm run build

# 2) Arquivos estáticos servidos pelo nginx
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
