const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const jobs = new Map();

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function generateImage(prompt, options = {}) {
  const {
    width = 512,
    height = 512,
    seed = -1,
    model = 'flux',
  } = options;

  const encodedPrompt = encodeURIComponent(prompt);
  const actualSeed = seed === -1 ? Math.floor(Math.random() * 999999) : seed;

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${actualSeed}&model=${model}&nologo=true`;

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
      job: 'GET /job/:jobId',
      image: 'GET /image/:jobId',
    },
    params: {
      prompt: 'Text prompt for image generation (required)',
      width: 'Image width (default: 512)',
      height: 'Image height (default: 512)',
      seed: 'Random seed, -1 for random (default: -1)',
    },
  });
});

app.get('/generate', async (req, res) => {
  try {
    const { prompt, width, height, seed } = req.query;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const jobId = generateId();
    jobs.set(jobId, { status: 'processing', prompt, createdAt: new Date().toISOString() });

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
    const { prompt, width, height, seed } = req.query;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const imageBuffer = await generateImage(prompt, {
      width: width ? parseInt(width) : 512,
      height: height ? parseInt(height) : 512,
      seed: seed ? parseInt(seed) : -1,
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
}, 60000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
