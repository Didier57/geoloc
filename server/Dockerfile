FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY shared ./shared
COPY server/package*.json ./
RUN npm install --omit=dev

COPY server/src ./src
RUN mkdir -p /data

EXPOSE 4000
CMD ["node", "src/index.js"]
