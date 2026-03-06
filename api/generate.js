const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Simple serverless proxy to Anthropic's Messages API.
 * Expects the same JSON body the frontend would send to Anthropic directly.
 *
 * Reads the API key from process.env.ANTHROPIC_API_KEY.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error: "Missing ANTHROPIC_API_KEY environment variable."
      })
    );
    return;
  }

  let incoming;
  try {
    incoming = req.body && typeof req.body === "object" ? req.body : await getRequestBody(req);
  } catch (err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Invalid JSON body." }));
    return;
  }

  // Normalise body to the expected Anthropic shape:
  // { model, max_tokens, messages: [{ role: "user", content: "..." }] }
  const userContent =
    (incoming &&
      Array.isArray(incoming.messages) &&
      incoming.messages[0] &&
      incoming.messages[0].content) ||
    incoming.content ||
    incoming.prompt ||
    "";

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: typeof incoming.max_tokens === "number" ? incoming.max_tokens : 1000,
    messages: [
      {
        role: "user",
        content: userContent
      }
    ]
  };

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Anthropic-Version": "2023-06-01",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      // Log full error response from Anthropic for debugging
      console.error("Anthropic API error:", upstream.status, text);
    }
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "application/json");
    res.end(text);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Upstream Anthropic request failed." }));
  }
};

async function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = data ? JSON.parse(data) : {};
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

