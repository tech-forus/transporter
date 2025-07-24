// src/pages/TransporterLoginPage.tsx

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../transporter-frontend/src/hooks/useAuth'; // Assuming you have this hook
import { Mail, Lock, LayoutPanelLeft } from 'lucide-react';


// You can swap this with a relevant illustration from undraw.co, etc.
const LoginIllustration = () => (
    <div className="w-full h-full flex items-center justify-center">
        <LayoutPanelLeft className="w-48 h-48 text-indigo-500" strokeWidth={1} />
    </div>
);

// A reusable Input with Icon component for consistency
const InputWithIcon = ({ icon, ...props }: { icon: React.ReactNode; [key: string]: any }) => (
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
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // --- Your Actual API Call Here ---
      const response = await login(email, password);
      if (response.success) {
        toast.success("Login Successful!");
      // Redirect based on role if available, otherwise default
        navigate('/dashboard');
             
        } else {
          toast.error(response.error ?? "Something went wrong during login.");
        }

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Login failed. Please check your credentials.');
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
                    <label className="block text-sm font-medium mb-1" htmlFor="email">Email Address</label>
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
                    <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
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
                        <input type="checkbox" className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                        <span className="ml-2 text-gray-700">Remember me</span>
                    </label>
                    <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                        Forgot Password?
                    </Link>
                </div>
                
                <button
                    type="submit"
                    className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-300"
                >
                    Login
                </button>

                 {/* Optional: Social Login Buttons */}
                 {/* <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">Or continue with</span>
                    </div>
                </div>

                <div>
                     <button type="button" className="w-full flex items-center justify-center py-2.5 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                        {/* Add Google Icon SVG or from a library */}
                        {/* <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039L38.804 9.81C34.553 5.958 29.658 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.844-5.647C34.553 5.958 29.658 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"></path><path fill="#1976D2" d="M43.611 20.083H24v8h11.303c-.792 2.237-2.231 4.16-4.082 5.591l6.19 5.238C42.612 34.869 44 30.013 44 24c0-1.341-.138-2.65-.389-3.917z"></path></svg>
                        Sign in with Google
                    </button>
                </div> */} 
                {/* End Social Login */}
            </form>
        </div>
      </div>
    </div>
  );
}