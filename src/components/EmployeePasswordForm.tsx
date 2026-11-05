// A team member (signed in with the password his owner created) sets his own password: shown as a card on Profile and
// as the blocking prompt on his first login. Owners never see it; their own password card is unchanged.
import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { useAuth } from '../hooks/useAuth';

const input = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#0d2438] text-slate-800 dark:text-white';

const EmployeePasswordForm = ({ onDone }: { onDone?: () => void }) => {
  const { updateUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (next.length < 8) { toast.error('Choose a password of at least 8 characters.'); return; }
    setSaving(true);
    try {
      await axios.post(`${API_BASE_URL}/api/transporter/auth/employee/change-password`, { currentPassword: current, newPassword: next });
      updateUser({ mustChange: false } as any);
      toast.success('Password changed.');
      setCurrent(''); setNext('');
      onDone?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not change the password. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 max-w-sm">
      <input className={input} type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input className={input} type="password" placeholder="New password (at least 8 characters)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      <button type="button" onClick={save} disabled={saving || !current || !next} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Change password
      </button>
    </div>
  );
};

export default EmployeePasswordForm;
