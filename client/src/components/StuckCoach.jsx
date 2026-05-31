import { useState, useRef, useEffect } from 'react';
import { sendCoachMessage } from '../services/gemini';

const INITIAL_MESSAGE = {
  role: 'assistant',
  text: 'היי! נתקעת? זה לגמרי בסדר 🙌\nספר לי מה אתה מנסה לעשות ובמה בדיוק נתקעת — ואני אעזור לך לחשוב על זה יחד.',
};

export default function StuckCoach() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', text };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await sendCoachMessage(messages, text);
      setMessages(m => [...m, { role: 'assistant', text: reply }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'מצטער, הייתה שגיאה. נסה שוב.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-3 rounded-full shadow-xl text-sm transition-transform hover:scale-105"
      >
        נתקעתי 🤔
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[85vh]" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-800 text-base">מאמן ה-AI שלך</h3>
                <p className="text-xs text-gray-400">אני כאן לעזור לך לחשוב — לא לתת תשובות 😊</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-bl-sm'
                      : 'bg-gray-100 text-gray-800 rounded-br-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-end">
                  <div className="bg-gray-100 text-gray-500 px-4 py-2.5 rounded-2xl rounded-br-sm text-sm animate-pulse">
                    חושב...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="תאר במה נתקעת..."
                rows={2}
                className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 text-right"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"
              >
                שלח
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
