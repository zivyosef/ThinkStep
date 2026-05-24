import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) { console.error('שגיאה בטעינת פרופיל:', error); return null; }
  return data;
}

export async function insertActivityEntry(userId, entry) {
  await supabase.from('activity_history').insert({ user_id: userId, ...entry });
  // Keep only last 10 rows
  const { data: rows } = await supabase.from('activity_history').select('id').eq('user_id', userId).order('created_at', { ascending: false });
  if (rows && rows.length > 10) {
    const toDelete = rows.slice(10).map(r => r.id);
    await supabase.from('activity_history').delete().in('id', toDelete);
  }
}

export async function getActivityHistory(userId) {
  const { data, error } = await supabase.from('activity_history').select('date, action, details').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
  if (error) return [];
  return data || [];
}

export async function saveTaskState(userId, state) {
  await supabase.from('user_tasks').upsert(
    { user_id: userId, state_json: state, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

export async function loadTaskState(userId) {
  const { data, error } = await supabase.from('user_tasks').select('state_json').eq('user_id', userId).single();
  if (error || !data) return null;
  return data.state_json;
}