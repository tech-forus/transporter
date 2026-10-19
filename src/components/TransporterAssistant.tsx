// FC AI for transporters. Look and behaviour mirror the shipper portal's FC AI
// widget (right-edge "May I help you?" tab, indigo/purple header, same bubbles,
// suggestion chips, Minimize vs Close). English by default; the assistant only
// switches language when the user writes in another one.
// Phase 1 is read-only: it explains the portal and the user's own account status
// and cannot change anything.
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Sparkles, Minus, X, Send, Loader2 } from 'lucide-react';
import { SUGGESTED_QUESTIONS, sendAssistantMessage, type ChatTurn } from '../utils/assistantApi';

const GREETING = "Hi! I'm FC AI, your FreightCompare copilot. Ask me about your account, documents, rates or bookings.";
const MAX_INPUT_LENGTH = 800;

const TransporterAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [turns, busy, isOpen]);

  // Keyboard/screen-reader users: focus the question box on open, and give focus back to the launcher on close.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  // The box is disabled while a reply is loading; put the cursor back once it finishes.
  useEffect(() => { if (!busy && isOpen) inputRef.current?.focus(); }, [busy, isOpen]);

  const ask = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const history = turns;
    setTurns([...history, { role: 'user', content: message }]);
    setInput('');
    setError(null);
    setBusy(true);
    try {
      const reply = await sendAssistantMessage(message, history);
      setTurns((t) => [...t, { role: 'assistant', content: reply }]);
    } catch (e) {
      // Take the unanswered question back out of the chat and into the box, so a retry is one tap
      // and the history never holds a question with no answer.
      setTurns(history);
      setInput(message);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Minimize keeps the conversation; Close clears it (same as the shipper widget).
  const closeAndReset = () => { setIsOpen(false); setTurns([]); setInput(''); setError(null); };

  return (
    <>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        className="fixed bottom-4 right-0 sm:bottom-auto sm:top-[240px] z-[9998] flex flex-col gap-1"
      >
        <button
          ref={launcherRef}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Open FC AI assistant"
          className="group relative flex items-center justify-center bg-blue-600 text-white shadow-[-4px_0_15px_-3px_rgba(37,99,235,0.4)] hover:bg-blue-700 transition-all duration-300 rounded-l-xl w-11 h-11 sm:w-auto sm:h-auto p-2 translate-x-[4px] hover:translate-x-0"
        >
          <Bot className="w-5 h-5 sm:hidden text-blue-100" />
          <div className="hidden sm:flex flex-col items-center gap-3 py-2">
            <Bot className="w-5 h-5 -rotate-90 text-blue-100" />
            <p className="[writing-mode:vertical-lr] rotate-180 text-sm font-bold tracking-wider whitespace-nowrap">May I help you?</p>
          </div>
          <span className="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-sm" />
        </button>
      </motion.div>

      {isOpen && (
        <motion.div
          role="dialog"
          aria-label="FC AI assistant"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18 }}
          onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
          className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-[9998] w-[calc(100vw-2rem)] max-w-sm h-[70vh] max-h-[560px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        >
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 px-5 py-4 text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black leading-none">FC AI</h3>
                <p className="text-indigo-100 text-[11px] font-medium mt-1">Your FreightCompare copilot</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsOpen(false)} title="Minimize" aria-label="Minimize FC AI" className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button onClick={closeAndReset} title="Close" aria-label="Close FC AI" className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div role="log" aria-live="polite" className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-white text-slate-700 border border-slate-200 rounded-bl-sm">{GREETING}</div>
            </div>

            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${t.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'}`}>{t.content}</div>
              </div>
            ))}

            {turns.length === 0 && !busy && (
              <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => ask(q)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors">{q}</button>
                ))}
              </div>
            )}

            {busy && (
              <div className="flex justify-start">
                <div role="status" className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span className="text-xs text-slate-400 font-medium">Thinking...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <div role="alert" className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-red-50 text-red-700 border border-red-100 rounded-bl-sm">{error}</div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="p-3 border-t border-slate-100 bg-white flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                aria-label="Your question"
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                rows={1}
                placeholder="Ask FC AI"
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                style={{ resize: 'none', appearance: 'none', WebkitAppearance: 'none' }}
                className="flex-1 resize-none appearance-none placeholder-shown:overflow-hidden placeholder-shown:whitespace-nowrap placeholder-shown:text-ellipsis bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-60 max-h-24"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </>
  );
};

export default TransporterAssistant;
