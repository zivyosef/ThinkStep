import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import cors from 'cors';
import calendarRouter from './routes/calendar.js';
import notificationsRouter from './routes/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3001', process.env.CLIENT_URL].filter(Boolean) }));
app.use(express.json());

// Serve env vars to legacy HTML pages
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.OPENROUTER_API_KEY = "${process.env.VITE_OPENROUTER_API_KEY}";`);
});

// Serve legacy HTML pages as static files
app.use(express.static(path.resolve(__dirname, '../legacy')));

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/tavily-sources', async (req, res) => {
  try {
    const { subject = '', assignmentType = '', topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Missing topic for source generation.' });
    }

    const optimizedQuery = `"${topic}" reliable academic sources bibliography ${subject} ${assignmentType}`
      .trim()
      .replace(/\s+/g, ' ');

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Tavily API key is not configured.' });
    }

    const tavilyResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: optimizedQuery,
        search_depth: 'advanced'
      })
    });

    const data = await tavilyResponse.json();
    if (!tavilyResponse.ok) {
      return res.status(tavilyResponse.status).json({ error: data || 'Tavily request failed' });
    }

    return res.json(data.results || data);
  } catch (error) {
    console.error('Tavily proxy error:', error);
    return res.status(500).json({ error: 'Failed to fetch Tavily sources.' });
  }
});

app.use('/api/calendar', calendarRouter);
app.use('/api/notifications', notificationsRouter);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
