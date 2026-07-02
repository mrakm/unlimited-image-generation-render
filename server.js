const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const jobs = new Map();
const uploads = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function generateImage(prompt, options = {}) {
  const {
    width = 512,
    height = 512,
    seed = -1,
    model = 'flux',
    ref,
  } = options;

  const encodedPrompt = encodeURIComponent(prompt);
  const actualSeed = seed === -1 ? Math.floor(Math.random() * 999999) : seed;

  let url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${actualSeed}&model=${model}&nologo=true`;

  if (ref) {
    url += `&image=${encodeURIComponent(ref)}`;
  }

  const response = await fetch(url, {
    redirect: 'follow',
    timeout: 120000,
  });

  if (!response.ok) {
    throw new Error(`Image generation failed: ${response.status}`);
  }

  const buffer = await response.buffer();
  return buffer;
}

app.get('/', (req, res) => {
  res.json({
    name: 'Unlimited Image Generation API',
    version: '1.0.0',
    usage: {
      generate: 'GET /generate?prompt=<text>',
      'generate/sync': 'GET /generate/sync?prompt=<text>',
      job: 'GET /job/:jobId',
      image: 'GET /image/:jobId',
      health: 'GET /health',
      upload: 'POST /upload (multipart: file)',
    },
    params: {
      prompt: 'Text prompt for image generation (required)',
      width: 'Image width (default: 512)',
      height: 'Image height (default: 512)',
      seed: 'Random seed, -1 for random (default: -1)',
      model: 'Pollinations model name (default: flux)',
      ref: 'Reference image URL or up:<id> for img2img',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required (multipart, field name: file)' });
  }

  const id = 'up:' + generateId();

  uploads.set(id, {
    buffer: req.file.buffer,
    contentType: req.file.mimetype,
    createdAt: new Date().toISOString(),
  });

  res.json({
    id,
    filename: req.file.originalname,
    size: req.file.size,
    usage: { ref: id },
  });
});

app.get('/ref/:refId', (req, res) => {
  const upload = uploads.get(req.params.refId);
  if (!upload) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  res.set('Content-Type', upload.contentType);
  res.send(upload.buffer);
});

app.get('/generate', async (req, res) => {
  try {
    const { prompt, width, height, seed, model, ref } = req.query;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    let resolvedRef = ref;
    if (ref && ref.startsWith('up:')) {
      const upload = uploads.get(ref);
      if (upload) resolvedRef = `${req.protocol}://${req.get('host')}/ref/${ref}`;
    }

    const jobId = generateId();
    jobs.set(jobId, { status: 'processing', prompt, ref: resolvedRef, createdAt: new Date().toISOString() });

    res.json({
      jobId,
      status: 'processing',
      check: `/job/${jobId}`,
      image: `/image/${jobId}`,
    });

    try {
      const imageBuffer = await generateImage(prompt, {
        width: width ? parseInt(width) : 512,
        height: height ? parseInt(height) : 512,
        seed: seed ? parseInt(seed) : -1,
        model: model || 'flux',
        ref: resolvedRef,
      });

      jobs.set(jobId, {
        status: 'completed',
        prompt,
        imageBuffer,
        contentType: 'image/jpeg',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      jobs.set(jobId, {
        status: 'failed',
        prompt,
        error: error.message,
        createdAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/generate/sync', async (req, res) => {
  try {
    const { prompt, width, height, seed, model, ref } = req.query;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    let resolvedRef = ref;
    if (ref && ref.startsWith('up:')) {
      const upload = uploads.get(ref);
      if (upload) resolvedRef = `${req.protocol}://${req.get('host')}/ref/${ref}`;
    }

    const imageBuffer = await generateImage(prompt, {
      width: width ? parseInt(width) : 512,
      height: height ? parseInt(height) : 512,
      seed: seed ? parseInt(seed) : -1,
      model: model || 'flux',
      ref: resolvedRef,
    });

    res.set('Content-Type', 'image/jpeg');
    res.send(imageBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/job/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const response = {
    id: req.params.jobId,
    status: job.status,
    prompt: job.prompt,
    createdAt: job.createdAt,
  };

  if (job.status === 'completed') {
    response.completedAt = job.completedAt;
    response.imageUrl = `/image/${req.params.jobId}`;
  }

  if (job.status === 'failed') {
    response.failedAt = job.failedAt;
    response.error = job.error;
  }

  res.json(response);
});

app.get('/image/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed' || !job.imageBuffer) {
    return res.status(404).json({ error: 'Image not ready yet' });
  }

  res.set('Content-Type', job.contentType || 'image/jpeg');
  res.send(job.imageBuffer);
});

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.completedAt || job.failedAt) {
      const time = new Date(job.completedAt || job.failedAt).getTime();
      if (now - time > 3600000) {
        jobs.delete(id);
      }
    }
  }
  for (const [id, upload] of uploads) {
    const time = new Date(upload.createdAt).getTime();
    if (now - time > 3600000) {
      uploads.delete(id);
    }
  }
}, 60000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
