FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /app/dist/coldtrace-frontend/browser /usr/share/nginx/html
COPY deployment/default.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://gateway:8080
EXPOSE 8080
