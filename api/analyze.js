/**
 * Sight v2.0 — Serverless AI Proxy
 * api/analyze.js (Vercel Serverless Function)
 *
 * Uses Groq API with llama-3.3-70b-versatile
 * To swap models later, just change GROQ_MODEL below.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

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

  // ─── Build messages ─────────────────────────────────────────────
  const messages = [
    { role: 'user', content: prompt }
  ];

  const groqBody = {
    model:       GROQ_MODEL,
    messages,
    temperature: 0.4,
    max_tokens:  4096,
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
