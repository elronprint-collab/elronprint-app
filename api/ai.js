// גשר לכלי ה-AI: מעביר בקשות מהאפליקציה אל elronprint-studio-api (שרת-לשרת, בלי CORS)
const UPSTREAM = "https://elronprint-studio-api.vercel.app/api";
const ALLOWED_ENDPOINTS = new Set(["upscale", "removebg-upload", "reimagine"]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { endpoint, payload } = req.body || {};
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return res.status(400).json({ error: "Unknown endpoint" });
  }
  try {
    const upstream = await fetch(`${UPSTREAM}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch {
    return res.status(502).json({ error: "AI service unavailable" });
  }
}
