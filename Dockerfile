# Build the Vite bundle with the locked Node dependencies.
FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve static assets with Nginx; its image entrypoint also renders runtime config.
FROM nginx:1.29-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY docker/runtime-config.js.template /etc/s3-app/runtime-config.js.template
COPY docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN mkdir -p /etc/s3-app \
    && chmod 0644 /etc/nginx/conf.d/default.conf /etc/s3-app/runtime-config.js.template \
    && chmod 0755 /docker-entrypoint.d/40-runtime-config.sh

# ENV values are stored in the image and available when its container starts.
# Kubernetes Pod env/envFrom, Compose environment, or `docker run -e` override
# same-named image defaults. The entrypoint renders the effective runtime values
# into runtime-config.js. ARG would be build-only and unavailable to this hook.
# VITE_UI_PORT is retained for frontend compatibility; Nginx listens on 3300.
ENV VITE_UI_PORT=3300 \
    VITE_API_TARGET=http://localhost:3100 \
    VITE_MAX_IMAGE_SIZE_BYTES=5242880

# Match the Helm frontend containerPort and Compose container port.
EXPOSE 3300
