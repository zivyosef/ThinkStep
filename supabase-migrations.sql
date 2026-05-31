-- ============================================================
--  Run these in the Supabase SQL Editor (supabase.com/dashboard)
-- ============================================================

-- 1. Add google_refresh_token to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- 2. Push notification subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  fcm_token  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- 3. Enable Realtime on user_tasks (so Zustand can subscribe)
-- In Supabase dashboard: Database → Replication → enable user_tasks
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE user_tasks;

-- 4. (Optional) Index for fast push_subscription lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
