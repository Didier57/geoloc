FROM node:22-alpine AS build
WORKDIR /app
COPY shared ./shared
COPY web/package*.json ./
RUN npm install
RUN mkdir -p node_modules/geoloc-shared && cp -r shared/* node_modules/geoloc-shared/
COPY web .
RUN npm run build

FROM nginx:1.27-alpine
COPY web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
