import { useState } from 'react';
import { useTaskStore } from '../store/taskStore';
import { exportTaskReport } from '../services/exportDocx';

function TaskRow({ task, level }) {
  const toggleComplete = useTaskStore(s => s.toggleComplete);
  const projectMeta = useTaskStore(s => s.projectMeta);
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = task.children?.length > 0;

  const sizeClass = level === 1
    ? 'text-base font-bold'
    : level === 2
    ? 'text-sm font-semibold'
    : 'text-sm font-normal';

  const indentClass = level === 1
    ? ''
    : level === 2
    ? 'mr-5'
    : 'mr-10';

  const bgClass = level === 1
    ? 'bg-white border border-gray-200 rounded-xl p-4 mb-2 shadow-sm'
    : level === 2
    ? 'bg-gray-50 rounded-lg p-3 mb-1'
    : 'bg-white rounded-md px-3 py-2 mb-1 border border-gray-100';

  return (
    <div className={`${indentClass}`}>
      <div className={bgClass}>
        <div className="flex items-center gap-3" dir="rtl">
          {/* Collapse toggle for L1/L2 */}
          {hasChildren && (
            <button
              onClick={() => setCollapsed(c => !c)}
              className="text-gray-400 hover:text-gray-600 w-5 text-xs flex-shrink-0"
            >
              {collapsed ? '▶' : '▼'}
            </button>
          )}

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => toggleComplete(task.id)}
            className="w-4 h-4 rounded accent-green-600 flex-shrink-0 cursor-pointer"
          />

          {/* Title */}
          <span className={`${sizeClass} flex-1 text-right ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {task.title}
          </span>

          {/* Time block badge */}
          {task.timeBlockStart && (
            <span className="flex-shrink-0 text-xs font-mono text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
              {task.timeBlockStart}–{task.timeBlockEnd}
            </span>
          )}
        </div>

        {/* Children */}
        {hasChildren && !collapsed && (
          <div className="mt-2 space-y-1">
            {task.children.map(child => (
              <TaskRow key={child.id} task={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HierarchicalChecklist() {
  const tasks = useTaskStore(s => s.tasks);
  const projectMeta = useTaskStore(s => s.projectMeta);
  const loading = useTaskStore(s => s.loading);
  const [exporting, setExporting] = useState(false);

  const flatCount = (nodes) => nodes.reduce((sum, t) => sum + 1 + (t.children ? flatCount(t.children) : 0), 0);
  const flatDone  = (nodes) => nodes.reduce((sum, t) => sum + (t.completed ? 1 : 0) + (t.children ? flatDone(t.children) : 0), 0);

  const total = flatCount(tasks);
  const done  = flatDone(tasks);
  const pct   = total ? Math.round((done / total) * 100) : 0;

  async function handleCompile() {
    setExporting(true);
    try {
      await exportTaskReport(tasks, projectMeta);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">טוען משימות...</div>;
  }

  if (!tasks.length) {
    return (
      <div className="text-center py-16 text-gray-400 text-lg">
        עדיין אין משימות. הזן את הפרויקט שלך כדי להתחיל.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" dir="rtl">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>התקדמות כוללת</span>
          <span>{done} / {total} משימות ({pct}%)</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Task tree */}
      <div className="space-y-2">
        {tasks.map(part => (
          <TaskRow key={part.id} task={part} level={1} />
        ))}
      </div>

      {/* Compile button */}
      <button
        onClick={handleCompile}
        disabled={exporting}
        className="mt-8 w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold text-lg py-4 rounded-2xl shadow-lg transition-colors flex items-center justify-center gap-2"
      >
        {exporting ? (
          <><span className="animate-spin">⏳</span> מייצא...</>
        ) : (
          <>📄 Compile &amp; הורד דוח</>
        )}
      </button>
    </div>
  );
}
