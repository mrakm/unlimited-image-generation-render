const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;
const QWEN_HF_SPACE = process.env.QWEN_HF_SPACE || 'https://cruisewagner2220-qwen-image-edit-rapid-aio-loras-5154351.hf.space';

const jobs = new Map();

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function sessionHash() {
  return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
}

async function generateWithFlux(prompt, options = {}) {
  const { width = 512, height = 512, seed = -1, model = 'flux' } = options;
  const encodedPrompt = encodeURIComponent(prompt);
  const actualSeed = seed === -1 ? Math.floor(Math.random() * 999999) : seed;

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${actualSeed}&model=${model}&nologo=true`;

  const response = await fetch(url, { redirect: 'follow', timeout: 120000 });
  if (!response.ok) throw new Error(`Image generation failed: ${response.status}`);
  return response.buffer();
}

async function uploadRefToQwenSpace(imageBuffer, filename) {
  const uploadId = generateId();
  const fd = new FormData();
  fd.append('files', imageBuffer, { filename, contentType: 'image/png' });

  const response = await fetch(`${QWEN_HF_SPACE}/gradio_api/upload?upload_id=${uploadId}`, {
    method: 'POST',
    body: fd,
    headers: fd.getHeaders(),
    timeout: 60000,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qwen Space upload failed (${response.status}): ${text}`);
  }

  const paths = await response.json();
  return paths[0];
}

async function waitForQwenGeneration(sessionHash, eventId, timeoutMs = 120000) {
  const start = Date.now();
  let url = `${QWEN_HF_SPACE}/gradio_api/queue/data?session_hash=${sessionHash}`;

  while (Date.now() - start < timeoutMs) {
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      timeout: timeoutMs,
    });

    if (!response.ok) throw new Error(`Queue data failed: ${response.status}`);

    const text = await response.text();
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.msg === 'process_completed' && data.event_id === eventId) {
          if (!data.success) {
            throw new Error(data.output?.error || 'Qwen generation failed');
          }
          const result = data.output?.data?.[0];
          if (result?.url) return result.url;
          if (result?.path) return `${QWEN_HF_SPACE}/gradio_api/file=${result.path}`;
          throw new Error('No image in Qwen response');
        }
        if (data.msg === 'process_generating' && data.success === false) {
          throw new Error(data.output?.error || 'Qwen generation error');
        }
      } catch (e) {
        if (e.message !== 'Qwen generation error') throw e;
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error('Qwen generation timed out');
}

async function generateWithQwen(prompt, refImageUrl, options = {}) {
  const {
    editing_style = 'None',
    seed = 0,
    randomize_seed = true,
    guidance = 1,
    steps = 4,
    target_megapixels = 1,
    decoder_vae = 'qwen',
    highlight_strength = 0.35,
  } = options;

  const sessHash = sessionHash();

  let refPath;
  if (refImageUrl.startsWith('http://') || refImageUrl.startsWith('https://')) {
    const imgResp = await fetch(refImageUrl, { timeout: 30000 });
    if (!imgResp.ok) throw new Error(`Failed to fetch ref image: ${imgResp.status}`);
    const imgBuffer = await imgResp.buffer();
    const contentType = imgResp.headers.get('content-type') || 'image/png';
    const ext = contentType.split('/')[1] || 'png';
    const filename = `ref.${ext}`;
    refPath = await uploadRefToQwenSpace(imgBuffer, filename);
  } else {
    refPath = refImageUrl;
  }

  const payload = {
    data: [
      { path: refPath, url: `${QWEN_HF_SPACE}/gradio_api/file=${refPath}`, orig_name: 'ref.png', size: null, mime_type: null, meta: { _type: 'gradio.FileData' } },
      null,
      [],
      prompt,
      editing_style,
      seed,
      randomize_seed,
      guidance,
      steps,
      target_megapixels,
      true,
      true,
      false,
      32,
      0,
      decoder_vae,
      false,
      true,
      highlight_strength,
    ],
    fn_index: 2,
    trigger_id: 11,
    session_hash: sessHash,
  };

  const joinResp = await fetch(`${QWEN_HF_SPACE}/gradio_api/queue/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 30000,
  });

  if (!joinResp.ok) throw new Error(`Qwen queue/join failed: ${joinResp.status}`);
  const joinData = await joinResp.json();
  if (!joinData.event_id) throw new Error('No event_id from Qwen');

  const resultUrl = await waitForQwenGeneration(sessHash, joinData.event_id);

  const imgResp = await fetch(resultUrl, { timeout: 60000 });
  if (!imgResp.ok) throw new Error(`Failed to fetch Qwen result: ${imgResp.status}`);
  return imgResp.buffer();
}

app.get('/', (req, res) => {
  res.json({
    name: 'Unlimited Image Generation API',
    version: '1.0.0',
    models: {
      flux: { description: 'Free text-to-image via Pollinations.ai', supports_ref: false },
      'qwen-edit': { description: 'Image-to-image editing via Qwen on HF Spaces', supports_ref: true },
    },
    usage: {
      generate: 'GET /generate?prompt=<text>',
      'generate/sync': 'GET /generate/sync?prompt=<text>',
      job: 'GET /job/:jobId',
      image: 'GET /image/:jobId',
      health: 'GET /health',
    },
    params: {
      prompt: 'Text prompt (required)',
      width: 'Image width in px (default: 512)',
      height: 'Image height in px (default: 512)',
      seed: 'Seed; -1 for random (default: -1 for flux, 0 for qwen-edit)',
      model: 'Model: flux (default) or qwen-edit',
      ref: 'Reference image URL (required for qwen-edit)',
      steps: 'Inference steps, qwen-edit only (default: 4)',
      guidance: 'Guidance scale, qwen-edit only (default: 1)',
      editing_style: 'Editing style, qwen-edit only (default: None). Options: None, Consistance, Semirealistic-photo-detailer, AnyPose, Any2Real_2601, Hyperrealistic-Portrait, Ultrarealistic-Portrait, BFS-Best-FaceSwap, F2P, Multiple-Angles, Light-Restoration, Relight, Multi-Angle-Lighting, Edit-Skin, Next-Scene, Flat-Log, Upscale-Image, Upscale2K',
      randomize_seed: 'Randomize seed each run, qwen-edit only (default: true)',
      highlight_strength: 'Highlight protection strength 0-1, qwen-edit only (default: 0.35)',
      target_megapixels: 'Target megapixels, 0 = match input, qwen-edit only (default: 1)',
      decoder_vae: 'Decoder VAE, qwen-edit only (default: qwen). Options: qwen, wan2x',
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

app.get('/generate', async (req, res) => {
  try {
    const { prompt, width, height, seed, model, ref } = req.query;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const m = model || 'flux';

    if (m === 'qwen-edit' && !ref) {
      return res.status(400).json({ error: 'ref is required for qwen-edit model' });
    }

    const jobId = generateId();
    jobs.set(jobId, { status: 'processing', prompt, model: m, ref, createdAt: new Date().toISOString() });

    res.json({
      jobId,
      status: 'processing',
      check: `/job/${jobId}`,
      image: `/image/${jobId}`,
    });

    try {
      let imageBuffer;

      if (m === 'qwen-edit') {
        imageBuffer = await generateWithQwen(prompt, ref, {
          editing_style: req.query.editing_style || 'None',
          seed: seed ? parseInt(seed) : 0,
          randomize_seed: req.query.randomize_seed !== 'false',
          guidance: req.query.guidance ? parseFloat(req.query.guidance) : 1,
          steps: req.query.steps ? parseInt(req.query.steps) : 4,
          target_megapixels: req.query.target_megapixels ? parseFloat(req.query.target_megapixels) : 1,
          decoder_vae: req.query.decoder_vae || 'qwen',
          highlight_strength: req.query.highlight_strength ? parseFloat(req.query.highlight_strength) : 0.35,
        });
      } else {
        imageBuffer = await generateWithFlux(prompt, {
          width: width ? parseInt(width) : 512,
          height: height ? parseInt(height) : 512,
          seed: seed ? parseInt(seed) : -1,
          model: m,
        });
      }

      jobs.set(jobId, {
        status: 'completed',
        prompt,
        model: m,
        ref,
        imageBuffer,
        contentType: 'image/jpeg',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      jobs.set(jobId, {
        status: 'failed',
        prompt,
        model: m,
        ref,
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

    const m = model || 'flux';

    if (m === 'qwen-edit' && !ref) {
      return res.status(400).json({ error: 'ref is required for qwen-edit model' });
    }

    let imageBuffer;

    if (m === 'qwen-edit') {
      imageBuffer = await generateWithQwen(prompt, ref, {
        editing_style: req.query.editing_style || 'None',
        seed: seed ? parseInt(seed) : 0,
        randomize_seed: req.query.randomize_seed !== 'false',
        guidance: req.query.guidance ? parseFloat(req.query.guidance) : 1,
        steps: req.query.steps ? parseInt(req.query.steps) : 4,
        target_megapixels: req.query.target_megapixels ? parseFloat(req.query.target_megapixels) : 1,
        decoder_vae: req.query.decoder_vae || 'qwen',
        highlight_strength: req.query.highlight_strength ? parseFloat(req.query.highlight_strength) : 0.35,
      });
    } else {
      imageBuffer = await generateWithFlux(prompt, {
        width: width ? parseInt(width) : 512,
        height: height ? parseInt(height) : 512,
        seed: seed ? parseInt(seed) : -1,
        model: m,
      });
    }

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

  const response = { id: req.params.jobId, status: job.status, prompt: job.prompt, model: job.model, createdAt: job.createdAt };

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
