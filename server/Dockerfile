FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY shared ./shared
COPY server/package*.json ./
RUN npm install --omit=dev
RUN mkdir -p node_modules && rm -rf node_modules/geoloc-shared && cp -r shared node_modules/geoloc-shared

COPY server/src ./src
RUN mkdir -p /data

EXPOSE 4000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
