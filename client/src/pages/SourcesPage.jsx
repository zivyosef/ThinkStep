import { useState, useEffect } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const SOURCES_LS_KEY = 'saved_sources';

function SourceItem({ source }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-r-4 border-blue-500 pr-3 py-2 my-3 bg-white/5 rounded-r-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 font-bold hover:underline text-sm leading-snug"
        >
          {source.title || 'מקור מידע'}
        </a>
        {source.content && (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:bg-white/10 transition-colors"
            aria-expanded={open}
          >
            {open ? 'הסתר תקציר' : 'הצג תקציר'}
          </button>
        )}
      </div>
      {open && source.content && (
        <p className="mt-2 text-sm text-gray-300 leading-relaxed">{source.content}</p>
      )}
    </div>
  );
}

export default function SourcesPage() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOURCES_LS_KEY);
      if (saved) {
        const { results: r, topic: t } = JSON.parse(saved);
        if (r) setResults(r);
        if (t)  setTopic(t);
      }
    } catch (_) {}
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const res = await fetch(`${SERVER_URL}/api/tavily-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `שגיאת שרת ${res.status}`);
      }

      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setResults(arr);
      try { localStorage.setItem(SOURCES_LS_KEY, JSON.stringify({ results: arr, topic: trimmed })); } catch (_) {}
    } catch (err) {
      setError(err.message || 'שגיאה בשליפת המקורות. ודא שהשרת פועל על פורט 3001.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1329] text-white" dir="rtl">
      <div className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-5">

        <div>
          <h1 className="text-2xl font-bold mb-1">מקורות מידע אקדמיים</h1>
          <p className="text-gray-400 text-sm">חפש מקורות איכותיים עבור הפרויקט שלך באמצעות Tavily</p>
        </div>

        {/* Search card */}
        <form
          onSubmit={handleSearch}
          className="bg-[#141e37] border border-blue-800/40 rounded-2xl p-5 shadow-lg"
        >
          <label htmlFor="topic-input" className="block text-sm font-medium text-gray-400 mb-1.5">
            מילות מפתח לנושא <span className="text-red-400">*</span>
          </label>
          <input
            id="topic-input"
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="הכנס מילות מפתח לחיפוש"
            className="w-full border border-white/10 rounded-xl px-3 py-2.5 text-sm bg-white/[0.06] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:bg-blue-950/30 transition-all"
            required
          />
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="mt-4 w-full py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl text-sm hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
          >
            {loading ? 'מחפש מקורות...' : 'הפעל שליפת מקורות'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results card */}
        {results !== null && (
          <div className="bg-[#1c2541] border border-[#3a506b] rounded-2xl p-5 shadow-md">
            <div className="text-sm font-bold text-white mb-3">
              מקורות אקדמיים שנמצאו ({results.length})
            </div>
            {results.length === 0 ? (
              <p className="text-red-400 text-sm">לא נמצאו מקורות רלוונטיים. נסה מילות מפתח שונות.</p>
            ) : (
              results.map((src, i) => <SourceItem key={i} source={src} />)
            )}
          </div>
        )}

        {/* Navigate to writing page */}
        <a
          href="/writing.html"
          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl text-sm text-center hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-600/30 transition-all block"
        >
          ✏️ עבור לעמוד הכתיבה
        </a>

      </div>
    </div>
  );
}
