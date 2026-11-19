# S3 App Frontend

A React single-page interface for the companion S3 image API. It supports image browsing and metadata, uploads and updates, individual and bulk deletion, JWT login, backend health checks, synthetic PostgreSQL traffic controls, and a browser activity panel.

## Scope and architecture

The app is a Vite-built React client. `src/main.jsx` mounts `src/App.jsx`; the app calls the backend REST API and renders the results. In development Vite proxies `/api` to `VITE_API_TARGET`. The production image builds the bundle with Node.js, then serves it from Nginx. `nginx/default.conf` is copied into the image at build time and provides SPA route fallback, static asset caching, safe response headers, and container log output. The Nginx image entrypoint renders `runtime-config.js`, allowing the API target and upload limit to be set when the container starts without rebuilding the bundle. The backend remains responsible for authentication, storage, authorization, health checks, and operational actions.

The frontend is not an authorization boundary. Protected routes must enforce access in the backend. The browser stores the JWT in `localStorage`, so use HTTPS and protect the user's browser session.

## Requirements and versions

- Node.js 18 or newer and npm for local development (the Docker build stage uses Node.js 24 Alpine; Nginx 1.29 Alpine serves the production bundle).
- A running compatible backend API, normally on `http://localhost:3100`.
- Docker and the companion `s3-app-backend` checkout for the included Compose setup.

React 18, React DOM 18, Vite 5, and `@vitejs/plugin-react` 4 are declared in `package.json`; `package-lock.json` pins the resolved dependency tree.

## Configuration

Copy `.env.example` to `.env` and adjust values for the local environment:

```powershell
Copy-Item .env.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_UI_PORT` | `3300` | Vite development server port. Nginx and the frontend container listen on port `3300`, matching the Helm container port. |
| `VITE_API_TARGET` | `http://localhost:3100` | Backend base URL. Vite uses it as the `/api` proxy target; a built container uses it as the browser API base. |
| `VITE_MAX_IMAGE_SIZE_BYTES` | `5242880` | Maximum frontend upload size in bytes. The backend must enforce its own limit too. |

Values prefixed with `VITE_` can be included in client-side assets. Do not put passwords, tokens, or other secrets in frontend environment variables. `VITE_API_TARGET` is logged only as a sanitized URL with any query values removed. At container startup, it must be an HTTP or HTTPS URL and must not contain quote or backslash characters because it is rendered into JavaScript configuration.

## Local development

From this directory, install the lockfile dependencies and start Vite:

```powershell
npm ci
npm run dev
```

Open `http://localhost:3300`. Change the API target in `.env` when the backend uses another host or port. Vite proxies `/api` requests to that target. `npm run build` creates the production bundle in `dist`; `npm run preview` serves that bundle locally. There are currently no lint, format, or test scripts in `package.json`.

## Docker and Compose

Build and run the frontend container:

```powershell
docker build -t s3-app-frontend .
docker run --rm -p 3300:3300 -e VITE_API_TARGET=http://localhost:3100 s3-app-frontend
```

For Compose, ensure the sibling `../s3-app-backend` checkout and its `.env` are present. Set the frontend `.env`, then run:

```powershell
docker compose up -d --build
docker compose logs -f s3-app-frontend
docker compose down
```

Compose also builds and starts the backend. It publishes host port `3300` to Nginx container port `3300`, matching the Helm frontend container port; the Nginx config is copied from `nginx/default.conf` during image build. The published frontend port and backend port should be restricted appropriately for the deployment. `docker compose down` retains no frontend state; image data belongs to backend-managed storage. Roll back by restoring the prior image/source revision and rebuilding with `docker compose up -d --build`.

## Logging and troubleshooting

`src/logger.js` is the browser logging boundary. It writes JSON records to the browser developer console with ISO-8601 timestamp, severity, service, module, event, message, and metadata. The activity panel shows a compact display string for recent UI events. Startup records include only the approved runtime summary; sensitive metadata keys are redacted centrally. Never add credentials, tokens, cookies, authorization headers, or raw request payloads to log metadata.

Open browser developer tools and inspect the Console for records. In Docker, use `docker compose logs -f s3-app-frontend` for Nginx access/error output and the runtime configuration startup record; browser-side logs remain in each user's browser console. Vite prints its development startup configuration in the terminal. If images do not load, check backend availability, the configured API target, browser network errors, backend CORS policy, and the backend's CloudFront URL configuration. If protected controls are unavailable, sign in and confirm the backend accepts the account and JWT.

## Security, limitations, and maintenance

- The browser necessarily receives image URLs and the user's JWT. Use TLS in deployed environments and avoid shared or untrusted browsers.
- The API target and upload limit are convenience settings, not security controls; enforce authorization and request limits in the backend.
- Health, traffic generation, restart, and bulk deletion controls depend on matching backend routes and backend policy.
- Runtime configuration is written into a JavaScript file by `docker-entrypoint.sh`; provide a valid HTTP(S) URL and numeric values when deploying.
- Dependency upgrades should update `package-lock.json`; verify the resulting production build and compatibility with the companion backend.
- The frontend has no automated test, lint, or formatting command configured at present.
