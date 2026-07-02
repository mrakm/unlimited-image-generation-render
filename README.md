# Unlimited Image Generation API

A free, unlimited image generation API powered by [Pollinations.ai](https://pollinations.ai/), packaged as a tiny Node.js / Express service ready to deploy on [Render](https://render.com/).

- No API keys required.
- Synchronous and asynchronous endpoints.
- Single-binary deploy — one file, two dependencies.
- Includes a liveness endpoint for keep-alive pings.

---

## Features

- Free unlimited image generation via Pollinations.ai
- Async job queue with polling (`/generate` → `/job/:id` → `/image/:id`)
- Sync endpoint for one-shot requests (`/generate/sync`)
- Configurable width, height, seed, and model
- Automatic job cleanup (1 hour retention)
- Liveness endpoint (`/health`) for external monitoring / keep-alive
- In-memory job store, zero external services required

---

## Quick Start (Local)

**Requirements:** Node.js 18 or newer.

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/unlimited-image-generation-render.git
cd unlimited-image-generation-render

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

The server listens on `http://localhost:3000` by default. Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

---

## Deployment to Render

1. Push this repository to your GitHub account.
2. In the Render dashboard, click **New** → **Web Service**.
3. Connect the GitHub repository.
4. Render will detect the Node.js project automatically. Confirm the settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (or any paid tier for guaranteed uptime)
5. Click **Create Web Service**. Render builds and deploys; the service URL is shown on the dashboard (e.g. `https://your-app.onrender.com`).

> **Note:** Render's free tier spins the service down after ~15 minutes of inactivity. Cold starts take 30–60 seconds. You can keep the service warm by pinging `GET /health` periodically from an external scheduler of your choice.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | TCP port the HTTP server listens on | `3000` |

No other configuration is required. There are no API keys, database URLs, or secrets.

---

## API Reference

Base URL: `http://localhost:3000` in development, or your Render service URL in production.

### `GET /`

Service information and usage summary.

**Response:** `200 OK`, JSON.

```json
{
  "name": "Unlimited Image Generation API",
  "version": "1.0.0",
  "usage": {
    "generate": "GET /generate?prompt=<text>",
    "generate/sync": "GET /generate/sync?prompt=<text>",
    "job": "GET /job/:jobId",
    "image": "GET /image/:jobId",
    "health": "GET /health",
    "upload": "POST /upload (multipart: file)"
  },
  "params": {
    "prompt": "Text prompt for image generation (required)",
    "width": "Image width (default: 512)",
    "height": "Image height (default: 512)",
    "seed": "Random seed, -1 for random (default: -1)",
    "model": "Pollinations model name (default: flux)",
    "ref": "Reference image URL or up:<id> for img2img"
  }
}
```

### `GET /health`

Liveness probe. Returns `200 OK` whenever the Node process is running.

**Response:** `200 OK`, JSON.

```json
{
  "status": "ok",
  "uptime": 12345.67,
  "timestamp": "2026-07-02T12:34:56.789Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` while the process is alive. |
| `uptime` | number | Seconds since the Node process started (`process.uptime()`). |
| `timestamp` | string | Current server time, ISO-8601 UTC. |

**Use cases:** external keep-alive pings, uptime monitoring, deployment smoke tests. Safe to call as often as desired; performs no upstream requests.

### `POST /upload`

Upload a reference image for img2img generation. Returns an ID you can pass as `ref` to `/generate` or `/generate/sync`.

**Request:** `multipart/form-data` with a `file` field (max 10 MB).

**Response:** `200 OK`, JSON.

```json
{
  "id": "up:abc123xyz",
  "filename": "my-image.jpg",
  "size": 123456,
  "usage": { "ref": "up:abc123xyz" }
}
```

Then use `?ref=up:abc123xyz` in your generation request.

### `GET /ref/:refId`

Serve a previously uploaded reference image. Used internally when an uploaded image is referenced in generation.

**Response:** `200 OK`, image binary with the original content type.

### `GET /generate`

Start an asynchronous generation job. Returns immediately with a job ID; the image is generated in the background.

**Query parameters:** see [Query Parameters](#query-parameters) below.

**Response:** `200 OK`, JSON.

```json
{
  "jobId": "abc123xyz",
  "status": "processing",
  "check": "/job/abc123xyz",
  "image": "/image/abc123xyz"
}
```

Then poll `GET /job/:jobId` until `status` is `"completed"`, and fetch the binary from `GET /image/:jobId`.

### `GET /generate/sync`

Generate an image and stream it back directly. No job ID, no polling — ideal for short prompts and one-off use.

**Query parameters:** see [Query Parameters](#query-parameters) below.

**Response:** `200 OK`, `Content-Type: image/jpeg`, binary image body.

### `GET /job/:jobId`

Get the current status of an async job.

**Response:** `200 OK`, JSON.

For a completed job:

```json
{
  "id": "abc123xyz",
  "status": "completed",
  "prompt": "a cute cat",
  "createdAt": "2026-07-02T12:00:00.000Z",
  "completedAt": "2026-07-02T12:00:08.000Z",
  "imageUrl": "/image/abc123xyz"
}
```

For a failed job:

```json
{
  "id": "abc123xyz",
  "status": "failed",
  "prompt": "a cute cat",
  "createdAt": "2026-07-02T12:00:00.000Z",
  "failedAt": "2026-07-02T12:00:30.000Z",
  "error": "Image generation failed: 504"
}
```

**Errors:** `404` if the job ID is unknown or has been cleaned up.

### `GET /image/:jobId`

Download the generated image as a binary file.

**Response:** `200 OK`, `Content-Type: image/jpeg`, binary image body.

**Errors:**
- `404 {"error":"Job not found"}` — unknown or expired job ID
- `404 {"error":"Image not ready yet"}` — job still processing, or failed

---

## Query Parameters

Applies to `GET /generate` and `GET /generate/sync`.

| Param   | Type    | Description                                  | Default |
|---------|---------|----------------------------------------------|---------|
| prompt  | string  | **Required.** Text prompt for generation.    | —       |
| width   | integer | Image width in pixels.                       | `512`   |
| height  | integer | Image height in pixels.                      | `512`   |
| seed    | integer | Random seed. Use `-1` for a fresh random seed each request. | `-1`    |
| model   | string  | Pollinations model name.                     | `flux`  |
| ref     | string  | Reference image URL for img2img. Use `up:<id>` for uploaded images. | —       |

URL-encode prompt text (spaces become `%20` or `+`).

---

## Usage Examples

### Sync request — save to file

```bash
curl -sSL "http://localhost:3000/generate/sync?prompt=a+cute+cat+sitting+on+a+rainbow" -o cat.jpg
```

### Async request — poll until ready

```bash
# 1. Submit job
JOB=$(curl -s "http://localhost:3000/generate?prompt=cyberpunk+cityscape+at+night")
echo "$JOB"
# {"jobId":"abc123xyz","status":"processing","check":"/job/abc123xyz","image":"/image/abc123xyz"}

JOB_ID=$(echo "$JOB" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).jobId))")

# 2. Poll status
until [ "$(curl -s http://localhost:3000/job/$JOB_ID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).status))")" = "completed" ]; do
  sleep 1
done

# 3. Download
curl -sSL "http://localhost:3000/image/$JOB_ID" -o cityscape.jpg
```

### Reference image (img2img) — public URL

```bash
curl -sSL "http://localhost:3000/generate/sync?prompt=a+dragon+in+the+same+style&ref=https://example.com/my-art.jpg" -o dragon.jpg
```

### Reference image — upload first

```bash
# 1. Upload the reference image
UPLOAD=$(curl -s -F "file=@./my-art.jpg" http://localhost:3000/upload)
REF_ID=$(echo "$UPLOAD" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")

# 2. Generate with the uploaded reference
curl -sSL "http://localhost:3000/generate/sync?prompt=a+dragon+in+the+same+style&ref=$REF_ID" -o dragon.jpg
```

### Reproducible seed

### Health check

```bash
curl -s http://localhost:3000/health
# {"status":"ok","uptime":1234.56,"timestamp":"2026-07-02T12:00:00.000Z"}
```

---

## Response Shapes

### Success — async submit

`200 OK`

```json
{ "jobId": "string", "status": "processing", "check": "/job/:id", "image": "/image/:id" }
```

### Success — sync image

`200 OK`, `Content-Type: image/jpeg`, binary body

### Success — health

`200 OK`

```json
{ "status": "ok", "uptime": 0, "timestamp": "ISO-8601 string" }
```

### Error — missing prompt

`400 Bad Request`

```json
{ "error": "prompt is required" }
```

### Error — unknown job

`404 Not Found`

```json
{ "error": "Job not found" }
```

### Error — image not ready

`404 Not Found`

```json
{ "error": "Image not ready yet" }
```

### Error — upstream failure

`500 Internal Server Error`

```json
{ "error": "<error message from Pollinations.ai>" }
```

---

## Limits & Notes

- **In-memory job store.** Jobs live in a `Map` inside the running Node process. They are lost on restart and not shared across instances.
- **1-hour retention.** Completed and failed jobs are automatically deleted 60 minutes after completion.
- **Single process.** This service does not scale horizontally out of the box — the job store is per-instance. Deploy as one instance.
- **No persistence.** Generated images are not saved to disk; they live only in the in-memory job record until cleaned up or downloaded.
- **Upstream dependency.** All generation traffic is proxied through Pollinations.ai. Outages there will surface as `500` errors here.
- **Render free-tier spin-down.** Inactivity for ~15 minutes causes Render to put the instance to sleep; the next request triggers a cold start of 30–60 seconds. Use `GET /health` from an external scheduler if you need the service to stay warm.
- **No authentication.** The API is fully public. Do not expose on a public URL if you need access control.

---

## Troubleshooting

**Server won't start — `Error: listen EADDRINUSE`**
Another process is using port 3000. Either stop it or run with a different port: `PORT=8080 npm start`.

**Images never finish — stuck on `processing`**
Pollinations.ai may be slow or temporarily unreachable. Check [https://image.pollinations.ai/](https://image.pollinations.ai/) directly. If the upstream is down, jobs will eventually move to `failed` with an upstream error message.

**Render deployment shows "Build failed"**
Confirm `package.json` is present at the repo root and `engines.node` is set to a version Render supports (Node 18+).

**Render free-tier service is slow on first request**
This is a cold start — the instance was spun down due to inactivity. Subsequent requests are fast. To avoid cold starts, hit `GET /health` periodically from an external scheduler.

**Job ID returns 404 immediately after creation**
Make sure you are hitting the same Render service instance — the in-memory job store is per-process and resets on every redeploy.

**`node: bad option: --check` or similar Node version errors**
The project requires Node 18+. Check with `node --version` and upgrade if needed.

---

## License

MIT. Free to use, modify, and distribute.
