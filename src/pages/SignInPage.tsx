// src/pages/TransporterLoginPage.tsx

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { Mail, Lock, LayoutPanelLeft, Loader2 } from 'lucide-react';

// You can swap this with a relevant illustration from undraw.co, etc.
const LoginIllustration = () => (
  <div className="w-full h-full flex items-center justify-center">
    <LayoutPanelLeft className="w-48 h-48 text-indigo-500" strokeWidth={1} />
  </div>
);

// A reusable Input with Icon component for consistency
const InputWithIcon = ({
  icon,
  ...props
}: {
  icon: React.ReactNode;
  [key: string]: any;
}) => (
  <div className="relative">
    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
      {icon}
    </span>
    <input
      {...props}
      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>
);

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // --- Your Actual API Call Here ---
      const response = await login(email, password);
      if (response.success) {
        toast.success("Login Successful!");
        navigate('/dashboard');
      } else {
        toast.error(response.error ?? "Something went wrong during login.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="flex w-full max-w-4xl bg-white rounded-lg shadow-2xl overflow-hidden mx-auto">
        
        {/* Left Side: Illustration & Branding */}
        <div className="hidden md:flex flex-col justify-center items-center w-1/2 bg-indigo-50 text-center p-8">
          <LoginIllustration />
          <h2 className="text-3xl font-bold mt-4 text-gray-800">Welcome Back!</h2>
          <p className="mt-2 text-gray-600">
            Log in to access your dashboard, manage shipments, and track your fleet.
          </p>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-1/2 p-8">
          <h1 className="text-3xl font-bold mb-2">Transporter Login</h1>
          <p className="text-gray-600 mb-8">
            Don't have an account?{' '}
            <Link to="/transporter-signup" className="text-blue-600 font-semibold hover:underline">
              Sign up
            </Link>
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" htmlFor="email">
                Email Address
              </label>
              <InputWithIcon
                icon={<Mail size={18} className="text-gray-400" />}
                type="email"
                id="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" htmlFor="password">
                Password
              </label>
              <InputWithIcon
                icon={<Lock size={18} className="text-gray-400" />}
                type="password"
                id="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            
            <div className="flex items-center justify-between mb-6">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-gray-700">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                Forgot Password?
              </Link>
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className={`
                w-full flex items-center justify-center gap-2
                bg-blue-600 text-white font-bold py-3 px-4 rounded-md
                hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                transition-all duration-300
                ${isLoading ? 'cursor-not-allowed opacity-70' : ''}
              `}
            >
              {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              {isLoading ? 'Signing In…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
