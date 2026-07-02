# Unlimited Image Generation API

A free, unlimited image generation API with two models:

- **Flux** — text-to-image via [Pollinations.ai](https://pollinations.ai/), no API key needed.
- **Qwen-Edit** — image-to-image editing via a Qwen model on Hugging Face Spaces, using a reference image.

Packaged as a tiny Node.js / Express service ready to deploy on [Render](https://render.com/).

---

## Features

- **Two models** — free text-to-image (flux) and image-to-image editing (qwen-edit)
- **Async job queue** — submit and poll (`/generate` → `/job/:id` → `/image/:id`)
- **Sync endpoint** — one-shot generation (`/generate/sync`)
- **Qwen-Edit params** — steps, seed, denoising strength, guidance, negative prompt, and more
- **Reference image** — pass any public URL as `ref`; the server fetches and uploads it to the HF Space
- **Automatic job cleanup** — completed/failed jobs expire after 1 hour
- **Health endpoint** — `GET /health` for keep-alive / monitoring
- **Zero external state** — in-memory job store, no database required

---

## Quick Start (Local)

**Requirements:** Node.js 18 or newer.

```bash
git clone https://github.com/<your-username>/unlimited-image-generation-render.git
cd unlimited-image-generation-render
npm install
npm start
```

Server listens on `http://localhost:3000` by default. Override with `PORT`:

```bash
PORT=8080 npm start
```

---

## Deployment to Render

1. Push the repository to GitHub.
2. In the Render dashboard, click **New** → **Web Service**.
3. Connect the GitHub repository.
4. Confirm the settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (or any paid tier)
5. Click **Create Web Service**.

> **Note:** Render's free tier spins down after ~15 minutes of inactivity. Cold starts take 30–60 seconds. Use `GET /health` from an external scheduler to keep the service warm.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | TCP port the HTTP server listens on | `3000` |
| `QWEN_HF_SPACE` | Base URL of the HF Space for Qwen-Edit model | `https://cruisewagner2220-qwen-image-edit-rapid-aio-loras-5154351.hf.space` |

---

## API Reference

Base URL: `http://localhost:3000` (development) or your Render service URL (production).

---

### `GET /`

Service information, available models, and usage summary.

**Response:** `200 OK`, JSON.

```json
{
  "name": "Unlimited Image Generation API",
  "models": {
    "flux": {
      "description": "Free text-to-image via Pollinations.ai",
      "supports_ref": false
    },
    "qwen-edit": {
      "description": "Image-to-image editing via Qwen on HF Spaces",
      "supports_ref": true
    }
  },
  "usage": {
    "generate": "GET /generate?prompt=<text>",
    "generate/sync": "GET /generate/sync?prompt=<text>",
    "job": "GET /job/:jobId",
    "image": "GET /image/:jobId",
    "health": "GET /health"
  },
    "params": {
      "prompt": "Text prompt (required)",
      "width": "Image width in px (default: 512)",
      "height": "Image height in px (default: 512)",
      "seed": "Seed; -1 for random (default: -1 for flux, 0 for qwen-edit)",
      "model": "Model: flux (default) or qwen-edit",
      "ref": "Reference image URL (required for qwen-edit)",
      "steps": "Inference steps, qwen-edit only (default: 4)",
      "guidance": "Guidance scale, qwen-edit only (default: 1)",
      "editing_style": "Editing style (default: None). Options: None, Consistance, Semirealistic-photo-detailer, AnyPose, Any2Real_2601, Hyperrealistic-Portrait, etc",
      "randomize_seed": "Randomize seed each run (default: true)",
      "highlight_strength": "Highlight protection 0-1 (default: 0.35)",
      "target_megapixels": "Target megapixels, 0=match input (default: 1)",
      "decoder_vae": "Decoder VAE: qwen or wan2x (default: qwen)"
    }
}
```

---

### `GET /health`

Liveness probe. Returns `200 OK` as long as the Node process is running.

```json
{
  "status": "ok",
  "uptime": 12345.67,
  "timestamp": "2026-07-02T12:34:56.789Z"
}
```

Safe to call as often as desired — no upstream requests.

---

### `GET /generate`

Start an asynchronous generation job. Returns immediately with a `jobId`. Poll `GET /job/:jobId` until `status` is `"completed"`, then download from `GET /image/:jobId`.

**Query Parameters:**

| Param | Type | Description | Default |
|-------|------|-------------|---------|
| `prompt` | string | **Required.** Text prompt describing the desired image. | — |
| `model` | string | Model to use: `flux` or `qwen-edit`. | `flux` |
| `ref` | string | **Required for qwen-edit.** URL of the reference image. | — |
| `width` | integer | Image width in pixels. Flux only. | `512` |
| `height` | integer | Image height in pixels. Flux only. | `512` |
| `seed` | integer | Random seed. `-1` = random for flux, `0` = for qwen-edit. | `-1` / `0` |
| `steps` | integer | Inference steps. Qwen-edit only. | `4` |
| `guidance` | float | Guidance scale. Qwen-edit only. | `1` |
| `editing_style` | string | Editing style preset. Qwen-edit only. Options: `None`, `Consistance`, `Semirealistic-photo-detailer`, `AnyPose`, `Any2Real_2601`, `Hyperrealistic-Portrait`, `Ultrarealistic-Portrait`, `BFS-Best-FaceSwap`, `F2P`, `Multiple-Angles`, `Light-Restoration`, `Relight`, `Multi-Angle-Lighting`, `Edit-Skin`, `Next-Scene`, `Flat-Log`, `Upscale-Image`, `Upscale2K` | `None` |
| `randomize_seed` | boolean | Randomize seed on each request. Qwen-edit only. | `true` |
| `highlight_strength` | float | Highlight protection strength (0–1). Higher = more protection. Qwen-edit only. | `0.35` |
| `target_megapixels` | float | Target canvas size in megapixels. `0` = match input. Qwen-edit only. | `1` |
| `decoder_vae` | string | Decoder VAE model. Qwen-edit only. Options: `qwen`, `wan2x`. | `qwen` |

**Response:** `200 OK`, JSON.

```json
{
  "jobId": "abc123xyz",
  "status": "processing",
  "check": "/job/abc123xyz",
  "image": "/image/abc123xyz"
}
```

---

### `GET /generate/sync`

Generate an image and stream it back directly. Same query parameters as `/generate`.

**Response:** `200 OK`, `Content-Type: image/jpeg`, binary image body.

---

### `GET /job/:jobId`

Get the current status of an async job.

**Completed:**
```json
{
  "id": "abc123xyz",
  "status": "completed",
  "prompt": "a cute cat",
  "model": "flux",
  "createdAt": "2026-07-02T12:00:00.000Z",
  "completedAt": "2026-07-02T12:00:08.000Z",
  "imageUrl": "/image/abc123xyz"
}
```

**Failed:**
```json
{
  "id": "abc123xyz",
  "status": "failed",
  "prompt": "a cute cat",
  "model": "flux",
  "createdAt": "2026-07-02T12:00:00.000Z",
  "failedAt": "2026-07-02T12:00:30.000Z",
  "error": "Image generation failed: 504"
}
```

**Errors:** `404` if the job ID is unknown or expired.

---

### `GET /image/:jobId`

Download the generated image.

**Response:** `200 OK`, `Content-Type: image/jpeg`, binary body.

**Errors:**
- `404 {"error":"Job not found"}` — unknown or expired job ID
- `404 {"error":"Image not ready yet"}` — job still processing, or failed

---

## Usage Examples

### Flux — text-to-image (sync)

```bash
curl -sSL "http://localhost:3000/generate/sync?prompt=a+cute+cat+sitting+on+a+rainbow" -o cat.jpg
```

### Flux — custom size and seed

```bash
curl -sSL "http://localhost:3000/generate/sync?prompt=cyberpunk+cityscape&width=1024&height=768&seed=42" -o city.jpg
```

### Flux — async with polling

```bash
# Submit the job
JOB=$(curl -s "http://localhost:3000/generate?prompt=cyberpunk+cityscape+at+night")
JOB_ID=$(echo "$JOB" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).jobId))")

# Poll until complete
until [ "$(curl -s http://localhost:3000/job/$JOB_ID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).status))")" = "completed" ]; do
  sleep 1
done

# Download
curl -sSL "http://localhost:3000/image/$JOB_ID" -o cityscape.jpg
```

### Qwen-Edit — image-to-image (sync)

```bash
curl -sSL "http://localhost:3000/generate/sync?model=qwen-edit&ref=https://example.com/my-photo.jpg&prompt=turn+this+into+an+oil+painting" -o painting.jpg
```

### Qwen-Edit — custom highlight strength and steps

```bash
curl -sSL "http://localhost:3000/generate/sync?model=qwen-edit&ref=https://example.com/sketch.png&prompt=colorize+this&highlight_strength=0.6&steps=8" -o colored.jpg
```

Lower `highlight_strength` (e.g. `0.2`) allows more change from the original. Higher (e.g. `0.6`) stays closer.

### Qwen-Edit — with editing style

```bash
curl -sSL "http://localhost:3000/generate/sync?model=qwen-edit&ref=https://example.com/portrait.jpg&prompt=a+professional+headshot&editing_style=Semirealistic-photo-detailer" -o headshot.jpg
```

Available editing styles: `None`, `Consistance`, `Semirealistic-photo-detailer`, `AnyPose`, `Any2Real_2601`, `Hyperrealistic-Portrait`, `Ultrarealistic-Portrait`, `BFS-Best-FaceSwap`, `F2P`, `Multiple-Angles`, `Light-Restoration`, `Relight`, `Multi-Angle-Lighting`, `Edit-Skin`, `Next-Scene`, `Flat-Log`, `Upscale-Image`, `Upscale2K`.

### Qwen-Edit — with custom seed and megapixels

```bash
curl -sSL "http://localhost:3000/generate/sync?model=qwen-edit&ref=https://example.com/photo.jpg&prompt=make+it+rain&seed=42&target_megapixels=1.5" -o rain.jpg
```

### Qwen-Edit — async

```bash
JOB=$(curl -s "http://localhost:3000/generate?model=qwen-edit&ref=https://example.com/photo.jpg&prompt=make+it+rain&steps=10")
JOB_ID=$(echo "$JOB" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).jobId))")

# Poll the same way as flux
until [ "$(curl -s http://localhost:3000/job/$JOB_ID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).status))")" = "completed" ]; do
  sleep 1
done

curl -sSL "http://localhost:3000/image/$JOB_ID" -o rain.jpg
```

### Health check

```bash
curl -s http://localhost:3000/health
# {"status":"ok","uptime":1234.56,"timestamp":"2026-07-02T12:00:00.000Z"}
```

---

## Limits & Notes

- **In-memory job store.** Jobs live in a `Map` inside the running Node process. Lost on restart, not shared across instances.
- **1-hour retention.** Completed and failed jobs are deleted 60 minutes after completion.
- **Single process.** The job store is per-instance — run one instance.
- **No persistence.** Images live in memory until downloaded or cleaned up.
- **Upstream dependencies:**
  - **Flux:** proxied through Pollinations.ai. Outages surface as `500` errors.
  - **Qwen-Edit:** proxied through a Hugging Face Space. The Space must be running. Free Spaces may cold-start on the first request (30–90s).
- **Render free-tier spin-down.** ~15 minutes of inactivity causes Render to sleep the instance. Use `GET /health` from an external scheduler to stay warm.
- **No authentication.** The API is fully public. Add your own auth layer if needed.

---

## Troubleshooting

**`{"error":"ref is required for qwen-edit model"}`**
The `qwen-edit` model requires a `ref` parameter with a URL to a reference image.

**Qwen-Edit request hangs or times out**
The Hugging Face Space may be cold-starting (free tier). Wait 30–90 seconds and retry. Check the Space status at the `QWEN_HF_SPACE` URL.

**Flux returns `429`**
Pollinations.ai rate limits free usage. Wait a few seconds and retry.

**Job ID returns 404 immediately**
You are hitting a different instance — the in-memory store is per-process and resets on redeploy.

**Server won't start — `EADDRINUSE`**
Another process is using port 3000. Use `PORT=8080 npm start` or stop the other process.

---

## License

MIT. Free to use, modify, and distribute.
