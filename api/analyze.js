/**
 * Sight v2.0 — Serverless AI Proxy
 * api/analyze.js (Vercel Serverless Function)
 *
 * Accepts POST requests with { prompt, image? }
 * API key is read from environment OR from X-Api-Key header (user's key)
 * The key is NEVER sent back to the client or logged beyond server scope.
 */

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export default async function handler(req, res) {
  // ─── CORS ──────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── API Key resolution ─────────────────────────────────────────
  // Only reads from server environment — never from client headers
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(401).json({ error: 'GEMINI_API_KEY not configured in Vercel environment variables.' });
  }

  // ─── Input validation ───────────────────────────────────────────
  const { prompt, image } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid prompt.' });
  }

  if (prompt.length > 25000) {
    return res.status(400).json({ error: 'Prompt too long.' });
  }

  // ─── Build Gemini request ───────────────────────────────────────
  const parts = [{ text: prompt }];

  if (image && typeof image === 'string' && image.length < 3000000) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: image,
      },
    });
  }

  const geminiBody = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errText.slice(0, 200));

      if (geminiRes.status === 400 || geminiRes.status === 403) {
        return res.status(401).json({ error: 'Invalid API key.' });
      }
      if (geminiRes.status === 429) {
        return res.status(429).json({ error: 'Rate limit hit. Wait a moment and try again.' });
      }
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await geminiRes.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!result) {
      return res.status(502).json({ error: 'Empty response from AI.' });
    }

    return res.status(200).json({ result });

  } catch (err) {
    console.error('Server error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
