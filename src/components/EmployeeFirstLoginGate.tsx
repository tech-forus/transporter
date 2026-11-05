// A team member's first sign-in with the password his owner created: he must choose his own before going on.
import { useAuth } from '../hooks/useAuth';
import EmployeePasswordForm from './EmployeePasswordForm';

const EmployeeFirstLoginGate = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || user?.role !== 'employee' || !user.mustChange) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-[#0d2438]">
        <h2 className="text-base font-bold text-slate-800 dark:text-white">Choose your own password</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500 dark:text-[#8fb0cf]">Hi {user.companyName}, the password you were given is temporary. Enter it below as the current password and set one only you know.</p>
        <EmployeePasswordForm />
      </div>
    </div>
  );
};

export default EmployeeFirstLoginGate;
