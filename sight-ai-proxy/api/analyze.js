// Sight AI Proxy — Deploy to Vercel
// Set env var: GEMINI_KEY = your Gemini API key
// Free at: https://aistudio.google.com

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { image, label, mode } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Missing image' });

  const GEMINI_KEY = process.env.GEMINI_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_KEY not set in Vercel env vars' });

  const prompt = buildPrompt(label || 'unknown object', mode);

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: image } }
          ]}],
          generationConfig: { maxOutputTokens: 200, temperature: 0.2, topP: 0.8 }
        })
      }
    );
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ result: text.replace(/```json\n?|\n?```/g, '').trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function buildPrompt(label, mode) {
  if (mode === 'person') {
    return `Analyze the person in this image. Return ONLY a compact JSON object with no markdown:
{"age_range":"e.g. 25-35","gender":"Male/Female/Unclear","expression":"Neutral/Happy/Focused/etc","clothing":"brief description","hair":"brief description","notable":"glasses/beard/hat/etc or none"}`;
  }
  if (mode === 'phone') {
    return `Identify the mobile phone in this image. Return ONLY compact JSON:
{"brand":"Apple/Samsung/Google/etc","model":"exact model if recognizable","approx_year":"e.g. 2023","color":"color","certainty":"High/Medium/Low","notes":"any distinctive features"}`;
  }
  return `Analyze the ${label} in this image precisely. Return ONLY compact JSON:
{"specific_type":"precise variant or type","brand":"brand if visible or Unknown","material":"main material","condition":"New/Good/Used/Worn","notable":"key distinguishing details","est_value":"price range USD"}`;
}
