import React from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { DocStatus } from '../hooks/useMyDocuments';

const STYLES: Record<DocStatus, { text: string; cls: string; icon: React.ReactNode }> = {
  pending: { text: 'Under review', cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: <Clock size={12} /> },
  verified: { text: 'Verified', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: <CheckCircle2 size={12} /> },
  rejected: { text: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-200', icon: <XCircle size={12} /> },
};

const DocStatusBadge: React.FC<{ status: DocStatus }> = ({ status }) => {
  const s = STYLES[status] ?? STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${s.cls}`}>
      {s.icon}{s.text}
    </span>
  );
};

export default DocStatusBadge;
