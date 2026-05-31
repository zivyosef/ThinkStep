import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function saveTaskState(userId, tasks, projectMeta) {
  await supabase.from('user_tasks').upsert(
    { user_id: userId, state_json: { tasks, projectMeta }, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

export async function loadTaskState(userId) {
  const { data, error } = await supabase
    .from('user_tasks')
    .select('state_json')
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data.state_json;
}

export async function insertActivityEntry(userId, entry) {
  await supabase.from('activity_history').insert({ user_id: userId, ...entry });
  const { data: rows } = await supabase
    .from('activity_history').select('id').eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (rows && rows.length > 10) {
    const toDelete = rows.slice(10).map(r => r.id);
    await supabase.from('activity_history').delete().in('id', toDelete);
  }
}
