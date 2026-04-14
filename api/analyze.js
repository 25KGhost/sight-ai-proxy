/**
 * Sight v2.0 — Serverless AI Proxy
 * api/analyze.js (Vercel Serverless Function)
 *
 * Text-only calls → llama-3.3-70b-versatile (fast, smart, great JSON)
 * Vision calls (image attached) → meta-llama/llama-4-scout-17b-16e-instruct (free vision model)
 */

const GROQ_API_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_TEXT      = 'llama-3.3-70b-versatile';
const MODEL_VISION    = 'meta-llama/llama-4-scout-17b-16e-instruct';

export default async function handler(req, res) {
  // ─── CORS ──────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── API Key ────────────────────────────────────────────────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(401).json({ error: 'GROQ_API_KEY not configured in Vercel environment variables.' });
  }

  // ─── Input validation ───────────────────────────────────────────
  const { prompt, image } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid prompt.' });
  }

  if (prompt.length > 25000) {
    return res.status(400).json({ error: 'Prompt too long.' });
  }

  // ─── Choose model + build messages ─────────────────────────────
  const hasImage = image && typeof image === 'string' && image.length < 3000000;
  const model    = hasImage ? MODEL_VISION : MODEL_TEXT;

  let messageContent;
  if (hasImage) {
    // Vision model expects content as array with image_url block
    messageContent = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${image}` },
      },
    ];
  } else {
    messageContent = prompt;
  }

  const groqBody = {
    model,
    messages: [{ role: 'user', content: messageContent }],
    temperature: 0.4,
    max_tokens:  1024,
  };

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqBody),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq error:', groqRes.status, errText.slice(0, 200));

      if (groqRes.status === 401 || groqRes.status === 403) {
        return res.status(401).json({ error: 'Invalid Groq API key.' });
      }
      if (groqRes.status === 429) {
        return res.status(429).json({ error: 'Rate limit hit. Wait a moment and try again.' });
      }
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data   = await groqRes.json();
    const result = data?.choices?.[0]?.message?.content || '';

    if (!result) {
      return res.status(502).json({ error: 'Empty response from AI.' });
    }

    return res.status(200).json({ result });

  } catch (err) {
    console.error('Server error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
