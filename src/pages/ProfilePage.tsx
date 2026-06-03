import React, { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';

// Lucide React Icons
import {
  Building, Mail, Phone, Clock, Globe, Truck, MapPin, Calendar,
  DollarSign, Package, Network, Info, Loader, AlertTriangle,
} from 'lucide-react';

// --- Type Definitions for Transporter Data ---
// Based on your Mongoose schema to ensure type safety.
interface TransporterData {
    companyName: string;
    phone: number;
    email: string;
    gstNo: string;
    address: string;
    state: string;
    pincode: number;
    officeStart: string;
    officeEnd: string;
    deliveryMode?: string;
    deliveryTat?: string;
    trackingLink?: string;
    websiteLink?: string;
    experience: number;
    maxLoading?: number;
    noOfTrucks?: number;
    annualTurnover?: number;
    customerNetwork?: string;
    // Standard JWT claims (optional)
    iat?: number;
    exp?: number;
}


// --- Reusable UI Components (Typed for TSX) ---

interface ProfileCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ title, icon, children }) => (
  <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200/80">
    <div className="p-5 md:p-6 border-b border-slate-200 bg-slate-50/50">
      <div className="flex items-center gap-3">
        <span className="text-blue-600">{icon}</span>
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      </div>
    </div>
    <div className="p-5 md:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
      {children}
    </div>
  </div>
);

interface ProfileFieldProps {
  label: string;
  value?: string | number | null;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const ProfileField: React.FC<ProfileFieldProps> = ({ label, value, icon, fullWidth = false }) => (
  <div className={`flex gap-3 items-start ${fullWidth ? 'col-span-1 sm:col-span-2 md:col-span-3' : ''}`}>
    {icon && <span className="text-slate-400 mt-1">{icon}</span>}
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-base font-medium text-slate-800 break-words">
        {value || <span className="text-sm text-slate-400 italic">Not Provided</span>}
      </p>
    </div>
  </div>
);


// --- Main Transporter Profile Page Component (TSX) ---

const ProfilePage: React.FC = () => {
  // State is now strongly typed with the TransporterData interface
  const [transporterData, setTransporterData] = useState<TransporterData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const token = Cookies.get('authToken');
      if (token) {
        // We cast the decoded token to our expected type for safety
        const decodedData = jwtDecode<TransporterData>(token);
        setTransporterData(decodedData);
      } else {
        setError('Authentication token not found. Please log in again.');
      }
    } catch (err) {
      console.error('Failed to decode token or token is invalid:', err);
      setError('Your session is invalid or has expired. Please log in again.');
    }
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-600 p-4">
        <AlertTriangle className="mb-3" size={40} />
        <p className="text-lg font-semibold text-center">Could not load profile</p>
        <p className="text-slate-600 text-center">{error}</p>
      </div>
    );
  }

  if (!transporterData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500">
        <Loader className="animate-spin mr-3" size={24} />
        <p className="text-lg">Loading Profile...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8">
          <div className="w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center text-4xl font-bold shadow-lg flex-shrink-0">
            {transporterData.companyName?.charAt(0) || 'T'}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{transporterData.companyName}</h1>
            <p className="text-md text-slate-600 mt-1">Transporter Profile</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <ProfileCard title="Company Details" icon={<Building size={24} />}>
            <ProfileField label="GST Number" value={transporterData.gstNo} icon={<Info size={16}/>} />
            <ProfileField label="Years of Experience" value={transporterData.experience ? `${transporterData.experience} years` : null} icon={<Calendar size={16}/>} />
            <ProfileField label="Number of Trucks" value={transporterData.noOfTrucks} icon={<Truck size={16}/>}/>
            <ProfileField label="Max Loading Capacity" value={transporterData.maxLoading ? `${transporterData.maxLoading} kg` : null} icon={<Package size={16}/>}/>
            <ProfileField label="Annual Turnover" value={transporterData.annualTurnover ? `₹ ${transporterData.annualTurnover.toLocaleString()}` : null} icon={<DollarSign size={16}/>}/>
          </ProfileCard>

          <ProfileCard title="Contact & Location" icon={<Phone size={24} />}>
            <ProfileField label="Email Address" value={transporterData.email} icon={<Mail size={16}/>}/>
            <ProfileField label="Phone Number" value={transporterData.phone} icon={<Phone size={16}/>}/>
            <ProfileField label="Website" value={transporterData.websiteLink} icon={<Globe size={16}/>}/>
            <ProfileField label="Full Address" value={`${transporterData.address}, ${transporterData.state} - ${transporterData.pincode}`} icon={<MapPin size={16}/>} fullWidth />
          </ProfileCard>

          <ProfileCard title="Operational Details" icon={<Clock size={24} />}>
            <ProfileField label="Office Timings" value={`${transporterData.officeStart} - ${transporterData.officeEnd}`} icon={<Clock size={16}/>}/>
            <ProfileField label="Delivery Mode" value={transporterData.deliveryMode} icon={<Package size={16}/>}/>
            <ProfileField label="Standard Delivery TAT" value={transporterData.deliveryTat} icon={<Calendar size={16}/>}/>
            <ProfileField label="Tracking Link" value={transporterData.trackingLink} icon={<Globe size={16}/>} fullWidth/>
          </ProfileCard>
            
          <ProfileCard title="Business Overview" icon={<Network size={24} />}>
             <ProfileField label="Customer Network" value={transporterData.customerNetwork} fullWidth icon={<Network size={16}/>}/>
          </ProfileCard>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;