# Unlimited Image Generation API

Free unlimited image generation API using Pollinations.ai. Deploy on Render.

## Endpoints

### Sync (returns image directly)
```
GET /generate/sync?prompt=a+cute+cat
```

### Async (returns job ID)
```
GET /generate?prompt=a+cute+cat
```
Response:
```json
{"jobId":"abc123","status":"processing","check":"/job/abc123","image":"/image/abc123"}
```

### Check job status
```
GET /job/:jobId
```

### Download image
```
GET /image/:jobId
```

## Parameters

| Param | Description | Default |
|-------|-------------|---------|
| prompt | Text prompt (required) | - |
| width | Image width | 512 |
| height | Image height | 512 |
| seed | Random seed (-1=random) | -1 |

## Deploy on Render

1. Push to GitHub
2. New Web Service on Render
3. Connect repo
4. Start command: `npm start`
5. Done
