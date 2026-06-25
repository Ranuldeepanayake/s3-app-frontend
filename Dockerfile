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

EXPOSE 3300
CMD ["serve", "-s", "/app/dist", "-l", "3300"]
