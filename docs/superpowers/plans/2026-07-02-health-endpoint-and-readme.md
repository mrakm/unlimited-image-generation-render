# Health Endpoint & README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GET /health` liveness endpoint to the Express server and rewrite `README.md` with comprehensive documentation so newcomers can install, run, deploy, and use the API without reading the source.

**Architecture:** One inline Express route added adjacent to the existing root route in `server.js`. Full `README.md` rewrite in place. No new dependencies, no architectural changes, no test framework introduced.

**Tech Stack:** Node.js >= 18, Express 4, node-fetch 2. Existing project only.

**Spec:** `docs/superpowers/specs/2026-07-02-health-endpoint-and-readme-design.md`

## Global Constraints

- Node.js >= 18 (from `package.json` engines).
- No new runtime dependencies — `package.json` dependencies list stays exactly `{express, node-fetch}`.
- Existing endpoints (`/`, `/generate`, `/generate/sync`, `/job/:jobId`, `/image/:jobId`) must behave identically after this change. Any deviation is a regression.
- The root route's `usage` map must be updated to include `health` so it stays in sync with the new endpoint.
- `/health` response shape is fixed: `{ status: "ok", uptime: <number>, timestamp: <ISO-8601 string> }` with HTTP 200.
- `/health` performs no external calls, no auth, no side effects, no rate limiting.
- README must not include cron-job configuration, scheduled workflow files, or any "how to keep the service alive" automation — per user instruction, that will be handled externally.
- Commit messages follow the existing repo style: `feat: ...`, `docs: ...`, `chore: ...`.

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server.js` | Modify | Add `app.get('/health', ...)` route; update root route's `usage` map to include `health` |
| `README.md` | Rewrite | Comprehensive single-file documentation |
| `package.json` | Unchanged | — |
| `package-lock.json` | Unchanged | — |

The project is intentionally small enough that introducing new files (e.g. `routes/health.js`, `docs/*.md`) would be premature. Keeping all changes in the existing files matches the project's current style.

## Task Decomposition Rationale

Two tasks, one logical change each:

1. **Task 1 — Health endpoint** is self-contained: a route, a JSON shape, and a regression check on the existing root route. Independently testable via curl.
2. **Task 2 — README rewrite** is independent of Task 1's code changes and can ship on its own.

Splitting further (e.g. separate task for the `usage` map update) would be over-decomposition — both edits are in the same file and need to land together for the route to be discoverable.

---

## Task 1: Add `/health` endpoint

**Files:**
- Modify: `server.js:39-55` (root route's `usage` map) and add new route after line 55

**Interfaces:**
- Consumes: existing Express `app` instance, `process.uptime()`, `new Date().toISOString()`
- Produces: `GET /health` returning `200` with body `{ status: "ok", uptime: number, timestamp: string }`

- [ ] **Step 1: Verify current state of `server.js`**

Run:
```bash
sed -n '39,55p' server.js
```
Expected: the existing root route handler with the `usage` object containing `generate`, `job`, `image`.

- [ ] **Step 2: Update the root route's `usage` map**

In `server.js`, replace the `usage` block inside `app.get('/', ...)` so it includes the new endpoint. Change:

```js
    usage: {
      generate: 'GET /generate?prompt=<text>',
      job: 'GET /job/:jobId',
      image: 'GET /image/:jobId',
    },
```

to:

```js
    usage: {
      generate: 'GET /generate?prompt=<text>',
      'generate/sync': 'GET /generate/sync?prompt=<text>',
      job: 'GET /job/:jobId',
      image: 'GET /image/:jobId',
      health: 'GET /health',
    },
```

(Note: `generate/sync` is added here too because it was missing from the existing map — same change, low risk, keeps `/` accurate.)

- [ ] **Step 3: Add the `/health` route**

In `server.js`, immediately after the closing `});` of the root route handler, add:

```js
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
```

- [ ] **Step 4: Sanity-check the file syntactically**

Run:
```bash
node --check server.js
```
Expected: no output, exit code 0. Any syntax error from the edit will print here.

- [ ] **Step 5: Smoke-test the endpoint manually**

Start the server in the background:

```bash
npm start &
SERVER_PID=$!
sleep 2
```

Hit the endpoint:

```bash
curl -s -o /tmp/health.json -w "HTTP %{http_code}\n" http://localhost:3000/health
cat /tmp/health.json
```

Expected output:
```
HTTP 200
{"status":"ok","uptime":<number>,"timestamp":"<ISO-8601 string>"}
```

Verify the JSON has exactly three keys with the right types:

```bash
node -e "const j=require('/tmp/health.json'); console.assert(j.status==='ok', 'status wrong'); console.assert(typeof j.uptime==='number', 'uptime not number'); console.assert(typeof j.timestamp==='string' && !isNaN(Date.parse(j.timestamp)), 'timestamp not ISO'); console.log('health endpoint OK');"
```

Expected: `health endpoint OK`

Hit it again and confirm `uptime` increased:

```bash
sleep 2
curl -s http://localhost:3000/health | node -e "let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d); console.log('uptime after 2s:', j.uptime);})"
```

Expected: `uptime after 2s: <number greater than previous>`

Confirm the root route still works and now lists `health`:

```bash
curl -s http://localhost:3000/ | node -e "let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d); console.assert(j.usage.health==='GET /health', 'health missing from root usage'); console.log('root route OK');})"
```

Expected: `root route OK`

Stop the server:

```bash
kill $SERVER_PID
```

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: add GET /health liveness endpoint for keep-alive pings"
```

---

## Task 2: Rewrite README.md

**Files:**
- Modify: `README.md` (full rewrite)

**Interfaces:**
- Consumes: nothing (replaces the existing file wholesale)
- Produces: a single comprehensive README covering all 12 sections listed in spec section C2

- [ ] **Step 1: Back up the current README content for reference**

Run:
```bash
cp README.md /tmp/README.md.bak
```

(Not strictly required for execution — the current README is short and already in context — but a safety net in case the rewrite needs cross-checking.)

- [ ] **Step 2: Write the new README**

Overwrite `README.md` with the following content. Preserve the existing project name "Unlimited Image Generation API" so it matches `package.json`'s `name` field.

````markdown
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
    "health": "GET /health"
  },
  "params": {
    "prompt": "Text prompt for image generation (required)",
    "width": "Image width (default: 512)",
    "height": "Image height (default: 512)",
    "seed": "Random seed, -1 for random (default: -1)"
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

### Reproducible seed

```bash
curl -sSL "http://localhost:3000/generate/sync?prompt=mountain+lake&seed=42&width=1024&height=768" -o lake.jpg
```

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
````

- [ ] **Step 3: Verify the file**

Run:
```bash
wc -l README.md
head -5 README.md
```

Expected: line count roughly 180–220 lines. First five lines are the title and tagline.

Verify no cron-job instructions leaked in:

```bash
grep -iE "cron-job\.org|uptimerobot|github actions|workflow|keep.alive" README.md || echo "no cron instructions found (good)"
```

Expected: `no cron instructions found (good)` — confirms spec constraint is honored.

- [ ] **Step 4: Preview the rendered structure**

```bash
grep -n "^#" README.md
```

Expected: 12 top-level headings (`#`, `##`, or `###`) covering Title, Features, Quick Start, Deployment, Environment Variables, API Reference, Query Parameters, Usage Examples, Response Shapes, Limits & Notes, Troubleshooting, License. (Counts depend on heading levels chosen — at minimum the 12 sections from the spec must be present.)

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with full API reference and deployment guide"
```

---

## Self-Review Notes

- **Spec coverage:**
  - D1 (inline route) → Task 1 Step 3.
  - D2 (minimal liveness, no external calls) → Task 1 Step 3 + test in Step 5.
  - D3 (response shape) → Task 1 Step 3 + test in Step 5.
  - D4 (no cron in README) → Task 2 Step 3 grep check.
  - C1 (route handler) → Task 1.
  - C2 (12 README sections) → Task 2 Step 2.
  - Risk: `/health` listed in root route's usage map → Task 1 Step 2.
  - Testing section → Task 1 Step 5.

- **Placeholders:** None. All code blocks are complete.

- **Type consistency:** `process.uptime()` returns a `number` (seconds, float); `new Date().toISOString()` returns an `string` (ISO-8601). README table documents exactly these types. No drift.

- **One bonus change** flagged in Task 1 Step 2: adding `'generate/sync'` to the root route's `usage` map. The existing map was missing it; the fix is one line, keeps `/` accurate, and the spec's Risks section already mentions keeping `usage` in sync. If the reviewer wants to drop it, it's a single-line revert.