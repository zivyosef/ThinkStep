import { useState } from 'react';
import { useTaskStore } from '../store/taskStore';
import { decomposeTask } from '../services/gemini';
import HierarchicalChecklist from '../components/HierarchicalChecklist';
import StuckCoach from '../components/StuckCoach';

export default function TasksPage() {
  const { setTasksFromDecomposition, setProjectMeta, tasks, projectMeta } = useTaskStore();
  const [form, setForm] = useState({ title: '', subject: '', dueDate: '', studentName: '' });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate(e) {
    e.preventDefault();
    if (!form.title || !form.dueDate) return;
    setGenerating(true);
    setError('');
    try {
      const decomposed = await decomposeTask({
        topic: form.title,
        subject: form.subject,
        dueDate: form.dueDate,
      });
      setTasksFromDecomposition(decomposed, {
        title: form.title,
        dueDate: form.dueDate,
        studentName: form.studentName,
      });
    } catch (err) {
      setError('שגיאה בייצור המשימות. בדוק את מפתח ה-API.');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">לוח משימות</h1>
        <p className="text-gray-500 mb-8">הזן את פרטי הפרויקט וה-AI יפרק אותו לרשימת משימות עם לוח זמנים</p>

        {/* Project form */}
        {!tasks.length && (
          <form onSubmit={handleGenerate} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הפרויקט / המשימה *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="למשל: עבודת סיכום על המהפכה הצרפתית"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">מקצוע</label>
                <input
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="היסטוריה"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך הגשה *</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם התלמיד (לדוח)</label>
              <input
                value={form.studentName}
                onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))}
                placeholder="שם מלא"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={generating}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {generating ? '⏳ מייצר משימות...' : '✨ פרק לי את הפרויקט'}
            </button>
          </form>
        )}

        {/* Reset button when tasks exist */}
        {tasks.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">{projectMeta.title}</h2>
            <button
              onClick={() => useTaskStore.setState({ tasks: [] })}
              className="text-sm text-gray-400 hover:text-red-500"
            >
              התחל מחדש
            </button>
          </div>
        )}

        {/* The main checklist */}
        <HierarchicalChecklist />
      </div>

      {/* Floating "I'm Stuck" coach */}
      <StuckCoach />
    </div>
  );
}
