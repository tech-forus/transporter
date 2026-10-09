// A read-only address block for the booking details: the WHOLE address wraps over as many
// lines as it needs (never clipped to one line), can be selected with the mouse, and has a
// one-tap Copy button — the transporter usually needs to paste it into a maps app or a message.
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / blocked clipboard permission: use the classic hidden-textarea copy.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const CopyableAddress: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => {
  const text = (value ?? '').trim();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        {text && (
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label.toLowerCase()}`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
          >
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        )}
      </div>
      {text ? (
        <p className="w-full min-h-[38px] px-3 py-2 rounded-lg text-sm font-medium border bg-slate-50 border-slate-200 text-slate-800 whitespace-pre-wrap break-words select-text">{text}</p>
      ) : (
        <p className="w-full min-h-[38px] px-3 py-2 rounded-lg text-sm font-medium border bg-slate-100 border-slate-200 text-slate-400 italic">Not provided</p>
      )}
    </div>
  );
};

export default CopyableAddress;
