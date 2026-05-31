import { Router } from 'express';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { verifySupabaseJWT } from '../middleware/auth.js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Initialize Firebase Admin once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Save FCM token for a user
router.post('/subscribe', verifySupabaseJWT, async (req, res) => {
  const { fcmToken } = req.body;
  if (!fcmToken) return res.status(400).json({ error: 'fcmToken required' });

  await supabase.from('push_subscriptions').upsert(
    { user_id: req.user.id, fcm_token: fcmToken },
    { onConflict: 'user_id' }
  );

  res.json({ ok: true });
});

// Send a push notification to a specific user
router.post('/send', verifySupabaseJWT, async (req, res) => {
  const { title, body } = req.body;

  const { data: sub } = await supabase
    .from('push_subscriptions').select('fcm_token').eq('user_id', req.user.id).single();

  if (!sub?.fcm_token) return res.status(404).json({ error: 'No subscription found' });

  await admin.messaging().send({
    token: sub.fcm_token,
    notification: { title, body },
    webpush: {
      fcmOptions: { link: '/' },
    },
  });

  res.json({ ok: true });
});

// Daily digest — send today's tasks (called by cron/edge function)
router.post('/daily-digest', async (req, res) => {
  // Requires server-to-server secret (not JWT)
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: subs } = await supabase.from('push_subscriptions').select('user_id, fcm_token');
  if (!subs?.length) return res.json({ sent: 0 });

  let sent = 0;
  for (const sub of subs) {
    try {
      await admin.messaging().send({
        token: sub.fcm_token,
        notification: {
          title: '📚 המשימות שלך להיום',
          body: 'פתח את האפליקציה לראות את לוח הזמנים שלך',
        },
        webpush: { fcmOptions: { link: '/' } },
      });
      sent++;
    } catch (e) {
      // token expired — remove it
      if (e.code === 'messaging/registration-token-not-registered') {
        await supabase.from('push_subscriptions').delete().eq('user_id', sub.user_id);
      }
    }
  }

  res.json({ sent });
});

export default router;
