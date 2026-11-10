FROM node:20-alpine
WORKDIR /app
# Dependências primeiro: a camada fica em cache enquanto o package.json não mudar
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3003
EXPOSE 3003
CMD ["node", "src/index.js"]
