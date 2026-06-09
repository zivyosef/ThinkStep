exports.handler = async function (event) {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const apiKey = process.env.VITE_OPENROUTER_API_KEY;
  console.log('[openrouter-proxy] key present?', !!apiKey);
  if (!apiKey)
    return { statusCode: 500, body: JSON.stringify({ error: 'OpenRouter key not configured — VITE_OPENROUTER_API_KEY missing' }) };

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();
    console.log('[openrouter-proxy] OpenRouter status:', r.status);
    if (!r.ok) console.error('[openrouter-proxy] OpenRouter error:', JSON.stringify(data));
    return {
      statusCode: r.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('OpenRouter proxy error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Proxy failed' }) };
  }
};
