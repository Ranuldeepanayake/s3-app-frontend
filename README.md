# s3-app-frontend

A simple React application for interacting with the S3 image API in the backend project.

## Features
- List all images from the backend
- View a single image with its signed URL
- Upload a new image
- Update an existing image
- Delete an image
- Show a timestamped activity log in the browser

## Setup
```bash
npm install
npm run dev
```

The frontend uses Vite and proxies API calls to the backend. You can configure the UI port and backend target with environment variables:

```bash
VITE_UI_PORT=3300 VITE_API_TARGET=http://localhost:3100 npm run dev
```

## Docker
Build and run the frontend container:

```bash
docker build -t s3-app-frontend .
docker run -p 3300:3300 s3-app-frontend
```

You can also start the frontend with the backend using Docker Compose:

```bash
docker compose up --build
```

## Notes
- The UI expects the backend to be running before it loads data.
- The activity log is intended as a lightweight browser-side logger for debugging requests and UI events.
