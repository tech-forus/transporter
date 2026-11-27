// A login just created or reset, shown once: neutral (it is a secret, not a success message), one button copies email and
// password together, ✕ closes it. Used inline where the owner clicked, and at the top for a courier just added.
import { Copy, X } from 'lucide-react';
import toast from 'react-hot-toast';

export interface Credentials { title: string; email: string; password: string }

export default function CredentialsBox({ creds, onClose }: { creds: Credentials; onClose: () => void }) {
  const copy = () => navigator.clipboard?.writeText(`Login: ${creds.email}\nPassword: ${creds.password}`)
    .then(() => toast.success('Login details copied')).catch(() => {});
  return (
    <div role="status" className="relative rounded-lg border border-slate-300 dark:border-[#1d3f5c] bg-slate-50 dark:bg-[#0b1b2b] p-3 text-xs">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-200"><X size={14} /></button>
      <p className="font-bold text-slate-900 dark:text-white">{creds.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="text-slate-600 dark:text-slate-300">Login <b className="text-slate-900 dark:text-white">{creds.email}</b></span>
        <span className="text-slate-600 dark:text-slate-300">Password <b className="font-mono text-sm text-slate-900 dark:text-white">{creds.password}</b></span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100"><Copy size={12} /> Copy login details</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Shown once. Share it only with the person who handles this courier.</p>
    </div>
  );
}
