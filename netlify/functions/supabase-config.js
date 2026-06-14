exports.handler = async function (event) {
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const url     = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey)
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase config not configured' }) };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    body: JSON.stringify({ url, anonKey })
  };
};
