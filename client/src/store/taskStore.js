import { create } from 'zustand';
import { supabase, saveTaskState, loadTaskState } from '../services/supabase';

function buildHierarchy(decomposed, dueDate) {
  const start = new Date();
  const end = new Date(dueDate);
  const totalMs = end - start;

  let cursor = new Date(start);
  cursor.setHours(9, 0, 0, 0);

  const parts = decomposed.parts || [];
  const totalLeafCount = parts.reduce(
    (sum, p) => sum + p.sections.reduce((s, sec) => s + (sec.steps?.length || 1), 0),
    0
  );
  const msPerLeaf = totalMs / Math.max(totalLeafCount, 1);

  function toHHMM(d) {
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  const now = Date.now();
  let leafIdx = 0;

  return parts.map((part, pi) => {
    const partId = `part-${now}-${pi}`;
    const sections = (part.sections || []).map((sec, si) => {
      const secId = `sec-${now}-${pi}-${si}`;
      const steps = (sec.steps || []).map((stepTitle, sti) => {
        leafIdx++;
        const blockStart = new Date(cursor);
        cursor = new Date(cursor.getTime() + msPerLeaf);
        // wrap to next-day 9am if past 9pm
        if (cursor.getHours() >= 21) {
          cursor.setDate(cursor.getDate() + 1);
          cursor.setHours(9, 0, 0, 0);
        }
        const blockEnd = new Date(cursor);
        return {
          id: `step-${now}-${pi}-${si}-${sti}`,
          title: stepTitle,
          level: 3,
          parentId: secId,
          children: [],
          completed: false,
          completedAt: null,
          timeBlockStart: toHHMM(blockStart),
          timeBlockEnd: toHHMM(blockEnd),
        };
      });
      return { id: secId, title: sec.title, level: 2, parentId: partId, children: steps, completed: false, completedAt: null, timeBlockStart: steps[0]?.timeBlockStart || '', timeBlockEnd: steps[steps.length - 1]?.timeBlockEnd || '' };
    });
    return { id: partId, title: part.title, level: 1, parentId: null, children: sections, completed: false, completedAt: null, timeBlockStart: sections[0]?.timeBlockStart || '', timeBlockEnd: sections[sections.length - 1]?.timeBlockEnd || '' };
  });
}

function updateNodeCompleted(tasks, id) {
  return tasks.map(task => {
    if (task.id === id) {
      const next = !task.completed;
      return { ...task, completed: next, completedAt: next ? new Date().toISOString() : null };
    }
    if (task.children?.length) {
      return { ...task, children: updateNodeCompleted(task.children, id) };
    }
    return task;
  });
}

export const useTaskStore = create((set, get) => ({
  tasks: [],
  projectMeta: { title: '', dueDate: '', studentName: '' },
  loading: false,
  realtimeChannel: null,

  setProjectMeta: (meta) => set({ projectMeta: { ...get().projectMeta, ...meta } }),

  setTasksFromDecomposition: (decomposed, projectMeta) => {
    const tasks = buildHierarchy(decomposed, projectMeta.dueDate);
    set({ tasks, projectMeta });
  },

  toggleComplete: (id) => {
    const tasks = updateNodeCompleted(get().tasks, id);
    set({ tasks });
    const user = get()._user;
    if (user) saveTaskState(user.id, tasks, get().projectMeta);
  },

  loadFromSupabase: async (userId) => {
    set({ loading: true });
    const data = await loadTaskState(userId);
    if (data?.tasks) {
      set({ tasks: data.tasks, projectMeta: data.projectMeta || {} });
    }
    set({ loading: false });
  },

  persistToSupabase: async (userId) => {
    await saveTaskState(userId, get().tasks, get().projectMeta);
  },

  subscribeRealtime: (userId) => {
    const channel = supabase
      .channel(`user_tasks:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_tasks',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const remote = payload.new?.state_json;
        if (remote?.tasks) set({ tasks: remote.tasks, projectMeta: remote.projectMeta || {} });
      })
      .subscribe();
    set({ realtimeChannel: channel, _user: { id: userId } });
  },

  unsubscribeRealtime: () => {
    const ch = get().realtimeChannel;
    if (ch) supabase.removeChannel(ch);
    set({ realtimeChannel: null });
  },

  _user: null,
  setUser: (user) => set({ _user: user }),
}));
