import { Router } from 'express';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { verifySupabaseJWT } from '../middleware/auth.js';

const router = Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/calendar/callback'
);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Step 1: redirect user to Google OAuth consent screen
router.get('/auth', verifySupabaseJWT, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: req.user.id,
  });
  res.redirect(url);
});

// Step 2: Google redirects back here with auth code
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code) return res.status(400).send('Missing code');

  const { tokens } = await oauth2Client.getToken(code);
  await supabase.from('profiles').update({ google_refresh_token: tokens.refresh_token }).eq('id', userId);
  res.send('<script>window.close()</script><p>Calendar connected! You can close this tab.</p>');
});

// Step 3: create a calendar event for a task
router.post('/events', verifySupabaseJWT, async (req, res) => {
  const { taskTitle, description, startTime, endTime } = req.body;

  const { data: profile } = await supabase.from('profiles').select('google_refresh_token').eq('id', req.user.id).single();
  if (!profile?.google_refresh_token) return res.status(400).json({ error: 'Google Calendar not connected' });

  oauth2Client.setCredentials({ refresh_token: profile.google_refresh_token });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const { data: event } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: taskTitle,
      description,
      start: { dateTime: startTime, timeZone: 'Asia/Jerusalem' },
      end: { dateTime: endTime, timeZone: 'Asia/Jerusalem' },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 60 }],
      },
    },
  });

  res.json({ ok: true, eventId: event.id, eventLink: event.htmlLink });
});

// Batch: sync all tasks for a user
router.post('/sync-all', verifySupabaseJWT, async (req, res) => {
  const { tasks } = req.body;
  const results = [];

  const { data: profile } = await supabase.from('profiles').select('google_refresh_token').eq('id', req.user.id).single();
  if (!profile?.google_refresh_token) return res.status(400).json({ error: 'Google Calendar not connected' });

  oauth2Client.setCredentials({ refresh_token: profile.google_refresh_token });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  for (const task of tasks) {
    if (!task.timeBlockStart || !task.timeBlockEnd) continue;
    const today = new Date().toISOString().split('T')[0];
    const start = `${today}T${task.timeBlockStart}:00`;
    const end = `${today}T${task.timeBlockEnd}:00`;
    const { data: event } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: task.title,
        start: { dateTime: start, timeZone: 'Asia/Jerusalem' },
        end: { dateTime: end, timeZone: 'Asia/Jerusalem' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
      },
    });
    results.push({ taskId: task.id, eventId: event.id });
  }

  res.json({ ok: true, synced: results.length, results });
});

export default router;
