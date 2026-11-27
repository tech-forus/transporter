import React from 'react';

// One card style for every Profile section: plain white card, small sentence-case title, optional right-side slot.
const SectionCard = ({ title, right, children, className }: {
  title: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) => (
  <section className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-[#1d3f5c] dark:bg-[#0d2438] ${className ?? ''}`}>
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
      {right && <div className="ml-auto text-xs text-slate-500 dark:text-[#8fb0cf]">{right}</div>}
    </div>
    {children}
  </section>
);

export default SectionCard;
