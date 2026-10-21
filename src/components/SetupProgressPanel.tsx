// Side panel listing the rate-setup steps and how far along the transporter is —
// same idea as the shipper Add Vendor "Progress" panel. Any step with an onClick
// can be opened at any time; saving is still gated by the page itself.
import React from 'react';
import { Check } from 'lucide-react';

export type SetupStepStatus = 'done' | 'current' | 'todo';

export interface SetupStep {
  key: string;
  label: string;
  status: SetupStepStatus;
  /** Short status line under the label, e.g. "From your file". Defaults by status. */
  hint?: string;
  onClick?: () => void;
}

const DEFAULT_HINT: Record<SetupStepStatus, string> = {
  done: 'Completed',
  current: 'In progress',
  todo: 'Not started',
};

const SetupProgressPanel: React.FC<{ steps: SetupStep[]; className?: string }> = ({ steps, className = '' }) => {
  const done = steps.filter((s) => s.status === 'done').length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const r = 22;
  const circ = 2 * Math.PI * r;

  return (
    <aside className={`rounded-2xl border border-slate-200 dark:border-[#1d3f5c] bg-white dark:bg-[#0d2438] shadow-sm ${className}`}>
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-[#1d3f5c] px-4 py-4">
        <div className="relative h-14 w-14 flex-none">
          <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
            <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-slate-200 dark:stroke-[#1d3f5c]" />
            <circle
              cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
              className="stroke-blue-600 transition-[stroke-dashoffset] duration-500"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums text-slate-800 dark:text-white">{pct}%</span>
        </div>
        <div>
          <p className="text-base font-black text-slate-900 dark:text-white">Your setup</p>
          <p className="text-xs text-slate-500 dark:text-[#8fb0cf]">{done} of {steps.length} steps done</p>
        </div>
      </div>

      <ol className="p-2">
        {steps.map((s, i) => {
          const clickable = !!s.onClick;
          const body = (
            <>
              <span
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-black transition-colors
                  ${s.status === 'done' ? 'bg-emerald-500 text-white'
                    : s.status === 'current' ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40'
                    : 'bg-slate-100 dark:bg-[#08141f] text-slate-400 dark:text-[#6f93b8]'}`}
              >
                {s.status === 'done' ? <Check size={16} /> : i + 1}
              </span>
              <span className="min-w-0 text-left">
                <span className={`block text-sm font-bold ${s.status === 'todo' ? 'text-slate-500 dark:text-[#8fb0cf]' : 'text-slate-900 dark:text-white'}`}>{s.label}</span>
                <span className={`block text-xs ${s.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : s.status === 'current' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-[#6f93b8]'}`}>
                  {s.hint ?? (clickable && s.status === 'todo' ? 'Click to open' : DEFAULT_HINT[s.status])}
                </span>
              </span>
            </>
          );
          return (
            <li key={s.key}>
              {clickable ? (
                <button type="button" onClick={s.onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
};

export default SetupProgressPanel;
