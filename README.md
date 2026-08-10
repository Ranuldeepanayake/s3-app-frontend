# s3-app-frontend

A simple React application for interacting with the S3 image API in the backend project.

## Features
- List all images from the backend
- View a single image from the backend-provided CloudFront URL
- Show image metadata including display name, original file name, S3 key, bucket, MIME type, size, and timestamps
- Upload a new image
- Update an existing image
- Delete an image
- Login with backend JWT credentials
- Query the protected backend readiness health check
- Delete all images from a dedicated protected page
- Show a timestamped activity log in the browser

## Requirements

- Node.js 18+ for local development
- A running instance of the backend API 
- Docker, optional

## Environment
The frontend uses Vite and proxies API calls to the backend. You can configure the UI port and backend target with environment variables.
Copy the sample file, then replace the placeholder values:

```bash
cp .env.example .env
```

## Local Development
Install dependencies:

```bash
npm install
```

Start the API with reloads:

```bash
npm run dev
```

Or start it normally:

```bash
npm start
```

## Docker
Build and run

```bash
docker build -t s3-app-frontend .
docker run -p 3300:3300 --env-file .env s3-app-frontend
```

Use Docker Compose (builds and deploys both the backend and frontend):

```bash
docker compose up -d --build
```

## Notes
- The UI expects the backend to be running before it loads data.
- The backend must set `AWS_CLOUDFRONT_DOMAIN_NAME` for image previews to render. If it is missing, the UI still shows metadata and a friendly placeholder.
- Home remains the image dashboard. Use the navbar to open Login, Protected Health, and Delete All pages.
- Protected pages send the saved JWT as `Authorization: Bearer <token>`.
- The activity log is intended as a lightweight browser-side logger for debugging requests and UI events.
