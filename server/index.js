import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import calendarRouter from './routes/calendar.js';
import notificationsRouter from './routes/notifications.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', process.env.CLIENT_URL].filter(Boolean) }));
app.use(express.json());

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/calendar', calendarRouter);
app.use('/api/notifications', notificationsRouter);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
