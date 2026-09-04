FROM node:20-alpine AS build
WORKDIR /build
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# nginx entrypoint renders templates/*.template with envsubst; only NGINX_PORT is substituted.
ENV NGINX_ENVSUBST_FILTER=NGINX_PORT
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /build/dist/browser /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.d/40-inject-env.sh
RUN chmod +x /docker-entrypoint.d/40-inject-env.sh
