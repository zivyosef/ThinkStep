import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _client = null;

async function getClient() {
  if (_client) return _client;
  try {
    const r = await fetch('/api/supabase-config');
    if (r.ok) {
      const { url, anonKey } = await r.json();
      _client = createClient(url, anonKey);
    }
  } catch (_) {}
  // Fallback for local dev: config.js sets window.SUPABASE_URL / window.SUPABASE_ANON_KEY
  if (!_client)
    _client = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return _client;
}

// ── Auth ──────────────────────────────────────────────────────
export async function getCurrentUser() {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signIn(email, password) {
  const supabase = await getClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, displayName) {
  const supabase = await getClient();
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
}

export async function signOut() {
  const supabase = await getClient();
  return supabase.auth.signOut();
}

// ── Profile ───────────────────────────────────────────────────
export async function getProfile(userId) {
  const supabase = await getClient();
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data || null;
}

export async function saveProfile(userId, profileData) {
  const supabase = await getClient();
  const { error } = await supabase.from('profiles').upsert(
    { id: userId, ...profileData, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  return !error;
}

// ── Task state ────────────────────────────────────────────────
export async function saveTaskState(userId, state) {
  const supabase = await getClient();
  const { error } = await supabase.from('user_tasks').upsert(
    { user_id: userId, state_json: state, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  return !error;
}

export async function loadTaskState(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('user_tasks')
    .select('state_json')
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data.state_json;
}

// ── Activity ──────────────────────────────────────────────────
export async function insertActivityEntry(userId, entry) {
  const supabase = await getClient();
  await supabase.from('activity_history').insert({ user_id: userId, ...entry });
  const { data: rows } = await supabase
    .from('activity_history')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (rows && rows.length > 10) {
    const toDelete = rows.slice(10).map(r => r.id);
    await supabase.from('activity_history').delete().in('id', toDelete);
  }
}

export async function getActivityHistory(userId) {
  const supabase = await getClient();
  const { data } = await supabase
    .from('activity_history')
    .select('date, action, details')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
}

// ── window.supabaseHelpers — used by non-module page scripts ──
getClient().then(client => {
  window.supabaseHelpers = {
    getCurrentUser,
    signIn,
    signUp,
    signOut,
    getProfile,
    saveProfile,
    saveTaskState,
    loadTaskState,
    insertActivityEntry,
    getActivityHistory,
    client,
  };
  window.dispatchEvent(new Event('supabase:ready'));
});
