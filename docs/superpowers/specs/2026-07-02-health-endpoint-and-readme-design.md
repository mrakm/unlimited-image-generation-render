# Health Endpoint & README Design

**Date:** 2026-07-02
**Status:** Approved
**Author:** Brainstorming session

## Purpose

Two related improvements to the `unlimited-image-generation-render` project:

1. Add a minimal liveness health endpoint so an external cron job can keep the Render free-tier service from spinning down after 15 minutes of inactivity.
2. Replace the sparse `README.md` with a comprehensive one so any newcomer can install, run, deploy, and use the API without reading the source.

## Scope

In scope:

- One new route: `GET /health`
- Full rewrite of `README.md`
- No new runtime dependencies
- No changes to existing endpoints, data structures, or the in-memory job store

Out of scope (deliberately):

- Cron job configuration, scheduled workflow files, or any "keep-alive" automation inside this repo (the user will configure keep-alive externally on their own)
- Readiness/dependency checks (no upstream ping)
- Metrics endpoints (Prometheus, etc.)
- Persistence layer (still in-memory `Map`)
- Authentication, rate limiting, CORS

## Design Decisions

### D1. Health endpoint is inline in `server.js`

The file is small (~180 lines, one screen) and already inlines every other route. Extracting a `routes/health.js` router for a single trivial handler is premature abstraction and would introduce a pattern not used anywhere else. If the route surface grows beyond ~6 endpoints, re-evaluate.

### D2. Minimal liveness — no external calls

Returning a static `{status: "ok"}` is enough for keep-alive purposes. Pinging Pollinations.ai would:

- Add latency to every cron tick
- Make the endpoint flap when the upstream has transient issues
- Risk the cron service marking the Render service unhealthy during normal upstream blips

Liveness only proves the Node process is responsive; readiness would prove the upstream works. The project only needs liveness.

### D3. Response shape

```json
{
  "status": "ok",
  "uptime": 12345.67,
  "timestamp": "2026-07-02T12:34:56.789Z"
}
```

- `status`: fixed string `"ok"` for now. Reserved for future expansion to `"degraded"` etc.
- `uptime`: `process.uptime()` in seconds (float). Useful for confirming the process was actually restarted vs. served from a warm cache.
- `timestamp`: ISO-8601 UTC. Helps debugging clock skew between cron service and Render.

### D4. No cron instructions in the README

Per explicit user instruction. The README will describe the endpoint and its purpose so the user (and any future contributor) understands what `/health` is for, but will not recommend a specific cron provider, frequency, or setup steps.

## Component Design

### C1. `GET /health` route

```
GET /health
```

- **Auth:** none
- **Rate limit:** none (cron will hit this; cheap to allow)
- **Side effects:** none
- **Status code:** `200` always when the process is up
- **Body:** see D3
- **Implementation:** ~6 lines, added adjacent to the existing `app.get('/', ...)` route in `server.js`

Also: the existing `app.get('/', ...)` route lists a `usage` object describing available endpoints. That object must be updated to include `health: 'GET /health'` so `/` and the README stay in sync.

### C2. `README.md` rewrite

Single comprehensive file, no `docs/` split (the project is too small to justify it). Sections in order:

1. Title + tagline
2. Features (bullet list)
3. Quick Start (local install + run)
4. Deployment to Render (step-by-step)
5. Environment Variables table (`PORT`)
6. API Reference (all 6 endpoints, including the new `/health`)
7. Query parameters table (`prompt`, `width`, `height`, `seed`, `model`)
8. Usage examples (copy-pasteable `curl` for each endpoint)
9. Response shapes (success + error JSON)
10. Limits & notes (in-memory store, 1h job retention, single process, no persistence)
11. Troubleshooting (Render-specific gotchas: spin-down, cold starts, free tier limits)
12. License (MIT)

The README explicitly documents that `/health` exists for keep-alive use and is intended to be hit periodically, without prescribing *how*.

## Data Flow

### `/health` request flow

```
Client (cron service, monitoring, manual curl)
  → GET /health
  → Express route handler
  → build JSON {status, uptime, timestamp}
  → 200 OK
```

No async work, no DB, no upstream calls, no globals read except `process.uptime()` and `Date.now()`.

## Error Handling

The health endpoint cannot fail in any way that the caller cares about:

- If the process is running, Express serves the route → 200.
- If the process is not running, the OS / Render serves nothing → connection refused. The cron job interprets that as "service is down", which is correct.

No `try/catch`, no error handler middleware needed for this route.

## Testing

Manual smoke tests against a locally running server:

1. `npm install` completes with no errors.
2. `npm start` logs `Server running on port 3000`.
3. `curl -s http://localhost:3000/health` returns `200` with JSON body matching D3.
4. Hitting `/health` repeatedly returns monotonically increasing `uptime`.
5. `curl -s http://localhost:3000/` still returns the existing service-info object (regression check).
6. The other endpoints (`/generate`, `/generate/sync`, `/job/:id`, `/image/:id`) still respond the same way as before — verified by reading the diff: no changes outside the new route and the rewritten README.

Automated tests are out of scope for this change. The project currently has no test setup, and adding one is a separate effort.

## Files Touched

| File | Change |
|------|--------|
| `server.js` | Add `app.get('/health', ...)` handler (~6 lines) near the existing `/` route |
| `README.md` | Full rewrite (~150–200 lines, markdown) |
| `package.json` | Unchanged |
| `docs/superpowers/specs/2026-07-02-health-endpoint-and-readme-design.md` | This file |

## Risks

- **Risk:** Existing `/` route lists the usage map. Adding `/health` should keep it accurate. **Mitigation:** include `/health` in the root route's `usage` map so `/` and the README agree.
- **Risk:** README copy-pasteable examples could go stale if endpoint behavior changes. **Mitigation:** acceptable for this project size; the examples are simple and the project is single-author.

## Open Questions

None. All clarifying questions resolved during brainstorming.