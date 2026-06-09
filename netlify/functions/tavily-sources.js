exports.handler = async function (event) {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { topic, subject = '', assignmentType = '' } = body;
  if (!topic)
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing topic' }) };

  const apiKey = process.env.VITE_TAVILY_API_KEY;
  if (!apiKey)
    return { statusCode: 500, body: JSON.stringify({ error: 'Tavily key not configured' }) };

  const query = `"${topic}" reliable academic sources bibliography ${subject} ${assignmentType}`
    .trim().replace(/\s+/g, ' ');

  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        search_depth: 'advanced',
        max_results: 8,
        include_answer: false,
        include_raw_content: false
      })
    });

    const data = await r.json();

    if (!r.ok)
      return { statusCode: r.status, body: JSON.stringify({ error: data }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.results || data)
    };
  } catch (err) {
    console.error('Tavily proxy error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch sources' }) };
  }
};
