import React, { useState, ChangeEvent, DragEvent, FormEvent } from 'react';
import guidlines from '../assets/guidlines.jpg';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Hash, Grid3X3, UploadCloud, FileSpreadsheet, Download, Loader2, ArrowLeft, ArrowRight,
  CheckCircle, Building, Phone, Mail, KeyRound, MapPin, Map, Calendar, Clock, Ship, Link
} from 'lucide-react';

// --- Type Definitions for State ---
interface IFormData {
  companyName: string;
  phone: string;
  email: string;
  password: string;
  gstNo: string;
  address: string;
  stateName: string;
  pincode: string;
  experience: string;
  officeStart: string;
  officeEnd: string;
  deliveryMode: string;
  zoneCount: number;
  trackingLink: string;
  websiteLink: string;
  maxLoading: string;
  numTrucks: string;
  turnover: string;
  customerNetwork: string;
}

type FormErrors = Partial<Record<keyof IFormData | 'zones', string>>;

// --- Reusable UI Components (with enhancements) ---

/**
 * A styled card container for sectioning content.
 */
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8 ${className}`}>
    {children}
  </div>
);

/**
 * A highly reusable input field with integrated icon, label, and error display.
 */
interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: keyof IFormData | string;
  label: string;
  icon: React.ReactNode;
  error?: string;
}
const InputField: React.FC<InputFieldProps> = ({ id, label, icon, error, required = false, ...props }) => (
  <div className="w-full">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none">
        {icon}
      </span>
      <input
        id={id}
        {...props}
        required={required}
        className={`w-full pl-11 pr-3 py-2.5 border rounded-lg shadow-sm transition-all duration-300
          bg-slate-50 text-slate-900 placeholder:text-slate-400
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 focus:border-blue-600
          ${error ? 'border-red-500 ring-red-500/50' : 'border-slate-300/70'}
          disabled:bg-slate-200/70`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </div>
    <AnimatePresence>
      {error && (
        <motion.p
          id={`${id}-error`}
          className="mt-1.5 text-xs text-red-600"
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  </div>
);

/**
 * NEW: A reusable select field component for UI consistency.
 */
interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: keyof IFormData | string;
  label: string;
  icon: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}
const SelectField: React.FC<SelectFieldProps> = ({ id, label, icon, error, required = false, children, ...props }) => (
  <div className="w-full">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <div className="relative">
       <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none">
        {icon}
      </span>
      <select
        id={id}
        {...props}
        required={required}
        className={`w-full pl-11 pr-10 py-2.5 border rounded-lg shadow-sm transition-all duration-300
          bg-slate-50 text-slate-900 appearance-none
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 focus:border-blue-600
          ${error ? 'border-red-500 ring-red-500/50' : 'border-slate-300/70'}
          disabled:bg-slate-200/70`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {children}
      </select>
       <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4 4 4-4" /></svg>
      </div>
    </div>
    <AnimatePresence>
       {error && <motion.p id={`${id}-error`} className="mt-1.5 text-xs text-red-600" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>{error}</motion.p>}
    </AnimatePresence>
  </div>
);


/**
 * A multi-step progress indicator.
 */
const StepIndicator: React.FC<{ currentStep: number; steps: string[] }> = ({ currentStep, steps }) => (
  <nav aria-label="Progress">
    <ol role="list" className="flex items-center">
      {steps.map((step, idx) => (
        <React.Fragment key={step}>
          <li className="relative flex-1 flex items-center justify-center">
            <div className={`flex items-center justify-center h-10 w-10 rounded-full font-medium transition-colors duration-300 z-10
              ${idx < currentStep ? 'bg-blue-600 text-white' : ''}
              ${idx === currentStep ? 'bg-white border-2 border-blue-600 text-blue-600' : 'bg-slate-200 text-slate-500'}`
            }>
              {idx < currentStep ? <CheckCircle className="h-6 w-6" /> : idx + 1}
            </div>
            <p className={`absolute top-12 whitespace-nowrap text-sm font-medium transition-colors
              ${idx === currentStep ? 'text-blue-600' : 'text-slate-500'}`
            }>{step}</p>
          </li>
          {idx < steps.length - 1 && (
             <div className="flex-1 h-0.5 transition-colors bg-slate-200 relative -ml-2 -mr-2">
               <div className="h-full bg-blue-600 transition-all duration-500" style={{width: currentStep > idx ? '100%' : '0%'}} />
             </div>
          )}
        </React.Fragment>
      ))}
    </ol>
  </nav>
);

// --- Main Page Component ---
export default function SignUpPage() {
  // State Management
  const [formData, setFormData] = useState<IFormData>({
  companyName: '', phone: '', email: '', password: '', gstNo: '', address: '',
  stateName: '', pincode: '', experience: '', officeStart: '09:00',
  officeEnd: '18:00', deliveryMode: 'Road', zoneCount: 0,
  trackingLink: '', websiteLink: '', maxLoading: '', numTrucks: '', turnover: '', customerNetwork: '',
});

  const [zones, setZones] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const navigate = useNavigate();

  // --- Handlers ---
  const handleFormChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: id === 'zoneCount' ? Math.max(0, Number(value)) : value }));
    if (errors[id as keyof FormErrors]) {
        setErrors(prev => ({ ...prev, [id]: undefined }));
    }
    if (id === 'zoneCount') {
      const count = Math.max(0, Number(value));
      setZones(Array(count).fill(''));
      if(errors.zones) setErrors(prev => ({...prev, zones: undefined}));
    }
  };

  const handleZoneNameChange = (idx: number, val: string) => {
    setZones(z => z.map((zone, i) => (i === idx ? val : zone)));
    if(errors.zones) setErrors(prev => ({...prev, zones: undefined}));
  };

  // --- Step 1 Validation ---
  const validateStep1 = () => {
    const newErrors: FormErrors = {};
    if (!formData.companyName) newErrors.companyName = "Company name is required";
    if (!formData.email.includes('@')) newErrors.email = "Please enter a valid email address";
    if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters";
    if (!/^\d{10}$/.test(formData.phone)) newErrors.phone = "Enter a valid 10-digit phone number";
    if (!formData.gstNo) newErrors.gstNo = "GST number is required";
    if (!formData.address) newErrors.address = "Address is required";
    if (!formData.stateName) newErrors.stateName = "State is required";
    if (!/^\d{6}$/.test(formData.pincode)) newErrors.pincode = "Enter a valid 6-digit pincode";
    if (Number(formData.experience) <= 0) newErrors.experience = "Experience must be greater than 0";
    if (zones.length > 0 && zones.some(z => !z.trim())) newErrors.zones = "All zone names must be filled out";
    if (!formData.trackingLink) newErrors.trackingLink = "Tracking link is required";
    if (!formData.websiteLink) newErrors.websiteLink = "Website is required";
    if (Number(formData.maxLoading) <= 0) newErrors.maxLoading = "Max loading must be greater than 0";
    if (Number(formData.numTrucks) <= 0) newErrors.numTrucks = "Enter valid number of trucks";
    if (Number(formData.turnover) <= 0) newErrors.turnover = "Annual turnover must be greater than 0";
    if (!formData.customerNetwork) newErrors.customerNetwork = "Select customer network type";

    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleNextStep = (e: FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setCurrentStep(1);
    } else {
      toast.error('Please fill all required fields to continue.');
    }
  };

  // --- File Handling ---
  const handleDrag = (e: DragEvent<HTMLDivElement>, enter: boolean) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(enter);
  };
  
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    handleDrag(e, false);
    const uploadedFile = e.dataTransfer?.files[0];
    if (uploadedFile?.name.endsWith('.xlsx')) setFile(uploadedFile);
    else toast.error('Invalid file type. Please upload a .xlsx file.');
  };
  
  const handleFileSelect = (f: File | null) => {
    if (f?.name.endsWith('.xlsx')) setFile(f);
    else if (f) toast.error('Invalid file type. Please upload a .xlsx file.');
  };

  // --- Final Submission ---
  const handleSubmit = async () => {
    if (!file) return toast.error('Please select the service zone sheet.');
    
    setIsLoading(true);
    const toastId = toast.loading('Uploading data...');

    const dataToSubmit = new FormData();
    // FIX: Cleanly handle key renaming and avoid duplicate data
    const { stateName, ...restOfData } = formData;
    const finalData = { ...restOfData, state: stateName };

    Object.entries(finalData).forEach(([key, value]) => {
      dataToSubmit.append(key, String(value));
    });
    
    dataToSubmit.append('zones', JSON.stringify(zones.filter(z => z.trim()))); // Send non-empty zones
    dataToSubmit.append('sheet', file);
    
    try {
      const token = Cookies.get('authToken');
      await axios.post('https://backend-bcxr.onrender.com/api/transporter/auth/addtransporter', dataToSubmit, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast.success('Transporter added successfully!', { id: toastId });
      sessionStorage.setItem("companyName", formData.companyName);
      sessionStorage.setItem("zones", JSON.stringify(zones));
      navigate('/addprice');
    } catch (e: any) {
      const message = e.response?.data?.message || e.message || "An unknown error occurred.";
      toast.error(message, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    toast.success("Template download started!");
    const link = document.createElement('a');
    // FIX: This now points to a file in the `public` directory.
    // Ensure `transporter_zone_template.xlsx` exists in your project's `/public` folder.
    link.href = '/transporter_zone_template.xlsx';
    link.setAttribute('download', 'transporter_zone_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const steps = ['Transporter Details', 'Upload Sheet'];
  
  return (
    <div className="min-h-screen bg-slate-50/70 py-12">
      <div className="container mx-auto px-4 max-w-4xl space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-extrabold text-center text-slate-900 tracking-tight">Add New Transporter</h1>
          <p className="mt-2 text-center text-lg text-slate-600">Follow the steps below to onboard a new service provider.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="overflow-hidden">
            <div className="p-2 sm:p-4">
               <StepIndicator currentStep={currentStep} steps={steps} />
            </div>

            <div className="mt-12 px-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: currentStep === 0 ? 50 : -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: currentStep === 0 ? -50 : 50 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  {currentStep === 0 ? (
                    <form className="space-y-6" onSubmit={handleNextStep} noValidate>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <InputField id="companyName" label="Company Name" icon={<Building size={18}/>} value={formData.companyName} onChange={handleFormChange} error={errors.companyName} required />
                        <InputField id="phone" label="Contact Phone" icon={<Phone size={18}/>} type="tel" value={formData.phone} onChange={handleFormChange} error={errors.phone} required />
                        <InputField id="email" label="Contact Email" icon={<Mail size={18}/>} type="email" value={formData.email} onChange={handleFormChange} error={errors.email} required />
                        <InputField id="password" label="Set Password" icon={<KeyRound size={18}/>} type="password" value={formData.password} onChange={handleFormChange} error={errors.password} required />
                        <InputField id="gstNo" label="GST No." icon={<Hash size={18}/>} value={formData.gstNo} onChange={handleFormChange} error={errors.gstNo} required />
                        <InputField id="pincode" label="Pincode" icon={<MapPin size={18}/>} type="text" maxLength={6} value={formData.pincode} onChange={handleFormChange} error={errors.pincode} required />
                        <div className="sm:col-span-2">
                          <InputField id="address" label="Full Address" icon={<Map size={18}/>} value={formData.address} onChange={handleFormChange} error={errors.address} required />
                        </div>
                        <InputField id="stateName" label="State" icon={<Map size={18}/>} value={formData.stateName} onChange={handleFormChange} error={errors.stateName} required />
                        <InputField id="experience" label="Experience (years)" icon={<Calendar size={18}/>} type="number" value={formData.experience} onChange={handleFormChange} error={errors.experience} required />
                        <InputField id="zoneCount" label="Number of Zones" icon={<Grid3X3 size={18}/>} type="number" min="0" value={formData.zoneCount || ''} onChange={handleFormChange} required />
                        <InputField id="officeStart" label="Office Start" icon={<Clock size={18}/>} type="time" value={formData.officeStart} onChange={handleFormChange} error={errors.officeStart} required />
                        <InputField id="officeEnd" label="Office End" icon={<Clock size={18}/>} type="time" value={formData.officeEnd} onChange={handleFormChange} error={errors.officeEnd} required />
                         <div className="sm:col-span-2">
                            {/* REFACTOR: Using the new SelectField component */}
                            <SelectField id="deliveryMode" label="Primary Delivery Mode" icon={<Ship size={18} />} value={formData.deliveryMode} onChange={handleFormChange} error={errors.deliveryMode} required>
                                <option value="Road">Road</option>
                                <option value="Air">Air</option>
                                <option value="Rail">Rail</option>
                            </SelectField>
                        </div>
                        <InputField id="trackingLink" label="Tracking Link" icon={<Link size={18}/>} value={formData.trackingLink} onChange={handleFormChange} error={errors.trackingLink} required />
                        <InputField id="websiteLink" label="Website Link" icon={<Link size={18}/>} value={formData.websiteLink} onChange={handleFormChange} error={errors.websiteLink} required />
                        <InputField id="maxLoading" label="Max Loading Capacity (tons)" icon={<Truck size={18}/>} type="number" value={formData.maxLoading} onChange={handleFormChange} error={errors.maxLoading} required />
                        <InputField id="numTrucks" label="Number of Trucks" icon={<Truck size={18}/>} type="number" value={formData.numTrucks} onChange={handleFormChange} error={errors.numTrucks} required />
                        <InputField id="turnover" label="Annual Turnover (₹)" icon={<Hash size={18}/>} type="number" value={formData.turnover} onChange={handleFormChange} error={errors.turnover} required />

                        <SelectField id="customerNetwork" label="Customer Network" icon={<Building size={18}/>} value={formData.customerNetwork} onChange={handleFormChange} error={errors.customerNetwork} required>
                          <option value="">Select Network</option>
                          <option value="Domestic">Domestic</option>
                          <option value="International">International</option>
                        </SelectField>

                      </div>
                      
                      {zones.length > 0 && (
                        <div className="pt-6 border-t border-slate-200/80 space-y-4">
                          <h3 className="font-semibold text-slate-800">Zone Names<span className="text-red-500 ml-1">*</span></h3>
                           {/* IMPROVEMENT: Removed general error message from here */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {zones.map((z, idx) => (
                              // IMPROVEMENT: Error message is now passed to each input for better UX
                              <InputField key={idx} id={`zone-${idx}`} label={`Zone ${idx+1}`} icon={<Grid3X3 size={18}/>} value={z} onChange={e => handleZoneNameChange(idx, e.target.value)} error={errors.zones} required />
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="pt-4 flex justify-end">
                        <button type="submit" className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                          Next <ArrowRight size={18}/>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-6">
                      <div onDragEnter={e => handleDrag(e, true)} onDragLeave={e => handleDrag(e, false)} onDragOver={e => handleDrag(e, true)} onDrop={handleDrop} className={`p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ${isDragging ? 'border-blue-500 bg-blue-50/50 scale-105 shadow-inner' : 'border-slate-300 bg-slate-50/50 hover:border-blue-400'}`}>                      
                        <input type="file" accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => handleFileSelect(e.target.files?.[0]||null)} className="hidden" id="file-upload" />
                        <label htmlFor="file-upload" className="flex flex-col items-center justify-center space-y-2 cursor-pointer">  
                          <UploadCloud className={`w-14 h-14 mx-auto transition-colors ${isDragging ? 'text-blue-600' : 'text-slate-400'}`} strokeWidth={1.5} />
                          <p className="font-semibold text-slate-700">Click to upload or drag file here</p>
                          <p className="text-xs text-slate-500">Spreadsheet file (.xlsx format only)</p>
                        </label>
                      </div>
                      
                      {file && <div className="flex items-center gap-3 p-3 bg-green-50 text-green-800 rounded-lg border border-green-200"><FileSpreadsheet size={20}/> <span className="font-medium">{file.name}</span></div>}
                      
                      <div className="flex justify-between items-center pt-4">
                        <button onClick={() => setCurrentStep(0)} className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"><ArrowLeft size={18}/>Back</button>
                        <button onClick={handleSubmit} disabled={isLoading || !file} className="inline-flex items-center justify-center gap-2 w-40 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                           {isLoading ? <Loader2 className="animate-spin" size={20}/> : <><CheckCircle size={18}/> Upload</>}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Need the Template?</h3>
                <p className="mt-1 text-slate-500">Download the required .xlsx template to ensure correct formatting for service zones and pricing.</p>
              </div>
              <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-5 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                <Download size={18}/> Download Template
              </button>
            </div>
            <div className="mt-6 border-t border-slate-200/80 pt-6">
              <h4 className="font-semibold text-slate-700 mb-2">Template Guidelines</h4>
              <img src={guidlines} alt="Excel template guidelines" className="w-full rounded-lg shadow-md border" />
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}