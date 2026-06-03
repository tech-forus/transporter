import React, { useState } from 'react';
import type { ConflictField } from '../hooks/useGSTLookup';

interface GSTConflictPanelProps {
  conflicts: ConflictField[];
  onApply: (selectedKeys: string[]) => void;
  onKeep: () => void;
}

export const GSTConflictPanel: React.FC<GSTConflictPanelProps> = ({ conflicts, onApply, onKeep }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(conflicts.map((c) => [c.key, true])),
  );

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleApply = () =>
    onApply(Object.entries(checked).filter(([, v]) => v).map(([k]) => k));

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs shadow-sm">
      <p className="font-semibold text-amber-800 mb-2 text-[11px]">
        GST data found — review conflicts
      </p>
      <div className="space-y-2">
        {conflicts.map((conflict) => (
          <div key={conflict.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              id={`gst-conflict-${conflict.key}`}
              checked={checked[conflict.key] ?? true}
              onChange={() => toggle(conflict.key)}
              className="mt-0.5 h-3 w-3 rounded border-amber-400 text-amber-600 cursor-pointer shrink-0"
            />
            <label htmlFor={`gst-conflict-${conflict.key}`} className="cursor-pointer flex-1 min-w-0">
              <span className="font-semibold text-amber-900">{conflict.label}</span>
              <div className="flex flex-col gap-0.5 mt-0.5 text-[10px] leading-tight">
                <span className="text-slate-500 truncate">
                  Your entry: <span className="text-slate-700 font-medium">{conflict.currentValue}</span>
                </span>
                <span className="text-amber-700 truncate">
                  From GST: <span className="font-semibold">{conflict.gstValue}</span>
                </span>
              </div>
            </label>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2.5">
        <button
          type="button"
          onClick={handleApply}
          className="flex-1 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-amber-700 transition-colors"
        >
          Apply selected
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Keep my entries
        </button>
      </div>
    </div>
  );
};
