# Build stage for the React frontend.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# Serve the built app with a simple Node static server.
FROM node:24-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist /app/dist
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3300
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["sh", "-c", "serve -s /app/dist -l ${VITE_UI_PORT:-3300}"]
