// Friendly "reading your documents" loader — the same truck-on-a-road animation
// the shipper Add Vendor shows (freight-compare-frontend/src/pages/AddVendor.tsx,
// TruckProgressAnimation), so transporters never see the raw extraction log.
// Unlike that copy it paces itself: the bar eases toward 99% against a wall
// clock (extraction reports no real progress) and never visibly stalls.
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageSearch, ScanSearch, Boxes, Sparkles } from 'lucide-react';

const STAGES = [
  { upTo: 20, label: 'Reading your documents…', icon: PackageSearch },
  { upTo: 45, label: 'Scanning rate cards & charges…', icon: ScanSearch },
  { upTo: 75, label: 'Mapping zones & pincodes…', icon: Boxes },
  { upTo: 100, label: 'Putting it all together…', icon: Sparkles },
];

const TruckSVG: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="2" y="6" width="36" height="20" rx="2" fill="#2563eb" />
    <rect x="5" y="9" width="30" height="6" rx="1" fill="#bfdbfe" opacity="0.9" />
    <path d="M38 14 H50 C52 14 53 15 54 17 L58 23 C58.6 24 58 25 57 25 H38 Z" fill="#1d4ed8" />
    <path d="M50 16 L53.5 16 L56.2 21 H50 Z" fill="#dbeafe" />
    <rect x="2" y="26" width="58" height="2.5" fill="#1e3a8a" />
    <circle cx="13" cy="32" r="5.5" fill="#0f172a" />
    <circle cx="13" cy="32" r="2.4" fill="#cbd5e1" />
    <circle cx="48" cy="32" r="5.5" fill="#0f172a" />
    <circle cx="48" cy="32" r="2.4" fill="#cbd5e1" />
  </svg>
);

const TruckProgressAnimation: React.FC<{ expectedMs?: number }> = ({ expectedMs = 90000 }) => {
  const [progress, setProgress] = useState(2);
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      // Fast start, slows down, creeps toward 99% even if it overruns.
      const pct = Math.min(99, (1 - Math.exp(-elapsed / expectedMs)) * 97 + (elapsed / expectedMs) * 2);
      setProgress((prev) => Math.max(prev, pct));
    }, 250);
    return () => clearInterval(id);
  }, [expectedMs]);

  const stage = STAGES.find((s) => progress <= s.upTo) || STAGES[STAGES.length - 1];
  const StageIcon = stage.icon;
  const pct = Math.round(progress);
  const RING_R = 26;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div className="relative rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-gradient-to-br from-white via-blue-50 to-white dark:from-[#0d1b2e] dark:via-[#10233d] dark:to-[#0d1b2e] p-5 overflow-hidden">
      <motion.div
        className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-blue-200/40 dark:bg-blue-500/15 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative z-10 flex items-center gap-5">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 60 60" className="w-20 h-20 -rotate-90">
            <circle cx="30" cy="30" r={RING_R} fill="none" stroke="rgba(37,99,235,0.15)" strokeWidth="5" />
            <motion.circle
              cx="30" cy="30" r={RING_R} fill="none" stroke="#2563eb" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={RING_C}
              animate={{ strokeDashoffset: RING_C - (pct / 100) * RING_C }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-blue-600 dark:text-blue-300 tabular-nums">{pct}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={stage.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-100"
            >
              <StageIcon className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="truncate">{stage.label}</span>
            </motion.div>
          </AnimatePresence>

          <div className="relative h-9 mt-3">
            <div className="absolute bottom-2 left-0 right-0 h-2 rounded-full bg-blue-100 dark:bg-blue-950/70 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-700"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            <motion.div className="absolute bottom-1" animate={{ left: `calc(${pct}% - 18px)` }} transition={{ duration: 0.4, ease: 'easeOut' }}>
              <motion.div animate={{ y: [0, -1.5, 0] }} transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}>
                <TruckSVG className="w-11 h-7 drop-shadow-lg" />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
      <p className="relative z-10 mt-3 text-xs text-slate-400">
        This can take a minute or two — keep this page open while we read your files.
      </p>
    </div>
  );
};

export default TruckProgressAnimation;
