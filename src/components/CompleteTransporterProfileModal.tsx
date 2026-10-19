// transporter-main/src/components/CompleteTransporterProfileModal.tsx
//
// Blocking gate for a transporter account created via "Continue with
// Google" (profileComplete === false). Rendered app-wide from App.tsx's
// TransporterProfileGate so it intercepts every route until submitted
// successfully. Structurally mirrors freight-compare-frontend's
// CompleteShipperProfileModal.tsx (including its Plan-C bug fixes, applied
// here from the start): the "is the manual fallback needed" decision is
// latched into its own state, computed directly from gstLookup's own
// gstData rather than from watched form values, to avoid the exact
// render-timing bug found live in that reference component (a live
// computation from watch() is transiently true for one render even on a
// fully-successful GST lookup, mounting AddressAutosuggest and firing its
// current-location side effects unexpectedly).
import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Phone, Hash, Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/apiConfig';
import { useGSTLookup } from '../hooks/useGSTLookup';
import { useAuth } from '../hooks/useAuth';
import AddressAutosuggest from './AddressAutosuggest';
import AddressLocationPicker, { type AddressLocationValue } from './AddressLocationPicker';

axios.defaults.withCredentials = true; // same established pattern as ProfilePage.tsx etc. — the protected PUT below needs the real httpOnly cookie sent.

type FormValues = {
  accountType: 'business' | 'individual';
  gstNo: string;
  companyName: string;
  address: string;
  state: string;
  pincode: string;
  officeStart: string;
  officeEnd: string;
  phone: string;
  whatsapp: string;
  sameAsPhone: boolean;
  // Structured office/pickup location from the "Confirm Your Location" map
  // picker (AddressLocationPicker, ported from freight-compare-frontend) —
  // independent of the plain address/state/pincode above (which stay
  // driven by GST lookup / manual fallback for Business). Mandatory for
  // BOTH account types, mirroring freight-compare-frontend's shipper
  // signup Location step (mandatory for Business and Individual alike).
  flatNumber: string;
  buildingName: string;
  area: string;
  landmark: string;
  city: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  formattedAddress: string;
};

const digitsOnlyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return;
  if (!/^[0-9]$/.test(e.key)) e.preventDefault();
};

interface Props {
  email: string;
  firstNameHint: string;
  onComplete: () => void;
}

const CompleteTransporterProfileModal: React.FC<Props> = ({ email, firstNameHint: _firstNameHint, onComplete }) => {
  const { loginWithToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const gstLookup = useGSTLookup();

  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const verifiedPhoneRef = React.useRef<string | null>(null);

  // A real second step here for BOTH account types — a dedicated "Confirm
  // Your Office Location" screen using the full AddressLocationPicker,
  // mirroring freight-compare-frontend's CompleteShipperProfileModal.tsx /
  // SignupForm.tsx Location step. Business keeps its existing GST-fallback
  // text inputs (address/state) inline in step 1 unchanged — this step 2
  // only feeds the new structured fields, same additive relationship as
  // the shipper reference component.
  const [modalStep, setModalStep] = useState<'details' | 'address'>('details');

  const {
    register, handleSubmit, control, watch, setValue, trigger, formState: { errors },
  } = useForm<FormValues>({
    mode: 'onBlur',
    defaultValues: {
      accountType: 'business',
      gstNo: '', companyName: '', address: '', state: '', pincode: '',
      officeStart: '09:00', officeEnd: '18:00',
      phone: '', whatsapp: '', sameAsPhone: true,
      flatNumber: '', buildingName: '', area: '', landmark: '', city: '',
      lat: null, lng: null, placeId: null, formattedAddress: '',
    },
  });

  const accountTypeValue = watch('accountType');
  const isIndividualValue = accountTypeValue === 'individual';
  const gstNoValue = watch('gstNo');
  const sameAsPhone = watch('sameAsPhone');
  const phoneValue = watch('phone');
  const addressValue = watch('address');

  React.useEffect(() => {
    if (sameAsPhone) setValue('whatsapp', phoneValue, { shouldValidate: true });
  }, [sameAsPhone, phoneValue, setValue]);

  React.useEffect(() => {
    if (verifiedPhoneRef.current !== null && verifiedPhoneRef.current !== phoneValue) {
      setPhoneOtpSent(false);
      setPhoneVerified(false);
      setOtpValue('');
      verifiedPhoneRef.current = null;
    }
  }, [phoneValue]);

  const handleSendPhoneOtp = async () => {
    const digits = String(phoneValue || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(digits) || digits === '0000000000') {
      toast.error('Enter a valid 10-digit mobile number first.');
      return;
    }
    setSendingOtp(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/transporter/profile/contact/request-otp`, { field: 'phone', value: digits });
      if (res.data?.success) {
        setPhoneOtpSent(true);
        setPhoneVerified(false);
        setOtpValue('');
        toast.success('OTP sent to your mobile number.');
      } else {
        toast.error(res.data?.message || 'Could not send OTP.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    const digits = String(phoneValue || '').replace(/\D/g, '');
    if (!otpValue.trim()) {
      toast.error('Enter the OTP sent to your mobile number.');
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/transporter/profile/contact/confirm-otp`, { field: 'phone', value: digits, otp: otpValue.trim() });
      if (res.data?.success) {
        setPhoneVerified(true);
        verifiedPhoneRef.current = digits;
        toast.success('Mobile number verified!');
      } else {
        toast.error(res.data?.message || 'Invalid OTP.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const whatsappReg = register('whatsapp', {
    required: 'WhatsApp number is required.',
    pattern: { value: /^\d{10}$/, message: 'Enter a valid 10-digit WhatsApp number.' },
    setValueAs: (v: any) => String(v ?? '').replace(/\D/g, '').slice(0, 10),
  });

  const switchAccountType = (individual: boolean) => {
    setValue('accountType', individual ? 'individual' : 'business');
    gstLookup.reset();
    setModalStep('details');
  };

  // Gate on step 1's own required details (mirrors this file's onSubmit
  // completeness check for Business — companyName/address/state — done
  // early here too so a user can't reach step 2 with an incomplete step 1),
  // then advance to the address step instead of submitting.
  const handleContinueToAddress = async () => {
    const fieldsToValidate: (keyof FormValues)[] = isIndividualValue
      ? ['companyName', 'phone']
      : ['companyName', 'gstNo', 'pincode', 'officeStart', 'officeEnd', 'phone', 'whatsapp'];
    const valid = await trigger(fieldsToValidate);
    if (!valid) {
      toast.error('Please fill in all required fields correctly.');
      return;
    }
    if (!isIndividualValue && (!watch('companyName') || !watch('address') || !watch('state'))) {
      toast.error('Please fill in company name, address, and state.');
      return;
    }
    if (!phoneVerified) {
      toast.error('Please verify your mobile number via OTP first.');
      return;
    }
    setModalStep('address');
  };

  const enforceGstFormat = (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
  };

  React.useEffect(() => {
    if (isIndividualValue) return;
    gstLookup.lookup(gstNoValue, {
      companyName: '', address: '', state: '', city: '', pincode: watch('pincode'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstNoValue, isIndividualValue]);

  React.useEffect(() => {
    if ((gstLookup.status === 'success' || gstLookup.status === 'partial') && gstLookup.gstData) {
      if (gstLookup.gstData.pincode) setValue('pincode', gstLookup.gstData.pincode, { shouldValidate: true });
      if (gstLookup.gstData.legalName) setValue('companyName', gstLookup.gstData.legalName);
      if (gstLookup.gstData.address) setValue('address', gstLookup.gstData.address);
      if (gstLookup.gstData.stateName) setValue('state', gstLookup.gstData.stateName);
    }
  }, [gstLookup.status, gstLookup.gstData, setValue]);

  // Latched, decided from gstLookup's own gstData (source of truth) — NOT
  // from watched companyName/address/state — see this file's header comment
  // for why. Set once when a lookup attempt concludes; only a new lookup
  // (gstNoValue change) or switchAccountType's gstLookup.reset() clears it.
  const [manualFallbackNeeded, setManualFallbackNeeded] = useState(false);
  React.useEffect(() => {
    if (gstLookup.status === 'success' || gstLookup.status === 'partial') {
      setManualFallbackNeeded(
        !gstLookup.gstData?.legalName || !gstLookup.gstData?.address || !gstLookup.gstData?.stateName
      );
    } else if (gstLookup.status === 'failed') {
      setManualFallbackNeeded(true);
    } else {
      setManualFallbackNeeded(false);
    }
  }, [gstLookup.status, gstLookup.gstData]);
  const needsManualCompanyFields = !isIndividualValue && manualFallbackNeeded;

  const onSubmit = async (data: FormValues) => {
    if (!phoneVerified || verifiedPhoneRef.current !== String(data.phone || '').replace(/\D/g, '')) {
      toast.error('Please verify your mobile number via OTP first.');
      return;
    }
    if (!data.lat || !data.flatNumber?.trim()) {
      toast.error('Please confirm your office location first.');
      setModalStep('address');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        accountType: data.accountType,
        phone: data.phone,
        // Structured address from the dedicated address step — always
        // present here since submission is blocked above until the picker
        // has resolved a place (lat set) and Flat/House No. is filled.
        flatNumber: data.flatNumber,
        buildingName: data.buildingName,
        area: data.area,
        landmark: data.landmark,
        city: data.city,
        placeId: data.placeId,
        lat: data.lat,
        lng: data.lng,
        formattedAddress: data.formattedAddress,
      };
      if (data.accountType === 'business') {
        if (!data.companyName || !data.address || !data.state) {
          toast.error('Please fill in company name, address, and state.');
          setSubmitting(false);
          return;
        }
        payload.whatsapp = data.whatsapp;
        payload.gstNo = data.gstNo;
        payload.companyName = data.companyName;
        payload.address = data.address;
        payload.state = data.state;
        payload.pincode = data.pincode;
        payload.officeStart = data.officeStart;
        payload.officeEnd = data.officeEnd;
      } else {
        // Individual/owner-operator — companyName is still always required
        // by the schema (unlike shipper's isIndividual path), so send it.
        if (!data.companyName) {
          toast.error('Please fill in your company/trade name.');
          setSubmitting(false);
          return;
        }
        payload.companyName = data.companyName;
        // state is optional for Individual (transporterModel), but derived
        // from the address step's resolved place above — send it when set
        // so the profile page can show it instead of "Click to add".
        if (data.state) payload.state = data.state;
      }

      const res = await axios.put(`${API_BASE_URL}/api/transporter/auth/profile/complete-transporter-profile`, payload);
      if (res.data?.token) {
        loginWithToken(res.data.token);
        toast.success('Profile completed — welcome aboard!');
        onComplete();
      } else {
        toast.error(res.data?.message || 'Could not save your details.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save your details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full my-8 overflow-hidden"
      >
        <div className="h-1.5 bg-gradient-to-r from-amber-500 to-orange-600" />
        <div className="p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">Complete Your Transporter Profile</h2>
          <p className="text-sm text-slate-500 mt-1">
            Signed in as <span className="font-medium text-slate-700">{email}</span>. Just a few required details before you can use FreightCompare.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {modalStep === 'details' && (
            <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">I am a</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                <button type="button" onClick={() => switchAccountType(false)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${!isIndividualValue ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>
                  Business
                </button>
                <button type="button" onClick={() => switchAccountType(true)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${isIndividualValue ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>
                  Individual
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="companyName" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Company / Trade Name <span className="text-red-500">*</span>
              </label>
              <input
                {...register('companyName', { required: 'Company/trade name is required.', pattern: { value: /^[a-zA-Z0-9\s]*$/, message: 'Only letters, numbers, and spaces are allowed.' } })}
                id="companyName" maxLength={200}
                className={`w-full h-[38px] px-3 border rounded-lg text-[13px] bg-white text-slate-900 focus:outline-none focus:ring-2 ${errors.companyName ? 'border-red-400 focus:ring-red-400/40' : 'border-slate-200 focus:ring-amber-400/40'}`}
              />
              {errors.companyName && <p className="mt-1 text-xs text-red-600">{errors.companyName.message}</p>}
            </div>

            {!isIndividualValue && (
              <>
                {(gstLookup.status === 'success' || gstLookup.status === 'partial') && gstLookup.gstData?.legalName && (
                  <div className="flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                    <CheckCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-snug">
                      <span className="font-semibold">{gstLookup.gstData.legalName}</span>
                      {gstLookup.gstData.address && <span className="block text-amber-700 mt-0.5">{gstLookup.gstData.address}</span>}
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="gstNo" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    GST Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"><Hash size={16} /></span>
                    <input
                      {...register('gstNo', { required: 'GST Number is required.', setValueAs: (v: any) => String(v ?? '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '').slice(0, 15) })}
                      id="gstNo" maxLength={15} onInput={enforceGstFormat}
                      style={{ textTransform: 'uppercase' }} placeholder="GST Number"
                      className={`w-full h-[38px] pl-9 pr-3 border rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${errors.gstNo ? 'border-red-400 focus:ring-red-400/40' : 'border-slate-200 focus:ring-amber-400/40'}`}
                    />
                  </div>
                  {errors.gstNo && <p className="mt-1 text-xs text-red-600">{errors.gstNo.message}</p>}
                  {gstLookup.status === 'failed' && (
                    <p className="mt-1 text-[10px] text-amber-600 flex items-center gap-1"><AlertCircle size={11} /> Couldn't auto-verify — double check the GST number.</p>
                  )}
                </div>

                {needsManualCompanyFields && (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                    <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertCircle size={12} /> Couldn't auto-fill everything from GST — please fill these in:</p>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Address <span className="text-red-500">*</span></label>
                      <AddressAutosuggest
                        value={addressValue}
                        onChange={(text) => setValue('address', text, { shouldValidate: true })}
                        onResolve={() => {
                          // transporterModel has no structured flat/building/
                          // area/landmark/lat/lng fields to feed (see this
                          // plan's scope note) — the improved address TEXT is
                          // this field's entire benefit.
                        }}
                        placeholder="Full office address"
                        maxLength={300}
                        className="w-full h-[38px] border rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 border-slate-200 focus:ring-amber-400/40"
                      />
                    </div>
                    <div>
                      <label htmlFor="state" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">State <span className="text-red-500">*</span></label>
                      <input
                        {...register('state', { pattern: { value: /^[a-zA-Z\s]*$/, message: 'Only letters and spaces are allowed.' } })}
                        id="state" maxLength={25}
                        className={`w-full h-[38px] px-3 border rounded-lg text-[13px] bg-white text-slate-900 focus:outline-none focus:ring-2 ${errors.state ? 'border-red-400 focus:ring-red-400/40' : 'border-slate-200 focus:ring-amber-400/40'}`}
                      />
                      {errors.state && <p className="mt-1 text-xs text-red-600">{errors.state.message}</p>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Controller
                    name="pincode" control={control}
                    rules={{ required: 'Pincode is required.', pattern: { value: /^\d{6}$/, message: 'Pincode must be exactly 6 digits.' } }}
                    render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
                      <div>
                        <label htmlFor="pincode" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Pincode <span className="text-red-500">*</span></label>
                        <input
                          id="pincode" value={value} onChange={onChange} onBlur={onBlur} maxLength={6} inputMode="numeric"
                          className={`w-full h-[38px] px-3 border rounded-lg text-[13px] bg-white text-slate-900 focus:outline-none focus:ring-2 ${error ? 'border-red-400 focus:ring-red-400/40' : 'border-slate-200 focus:ring-amber-400/40'}`}
                        />
                        {error && <p className="mt-1 text-xs text-red-600">{error.message}</p>}
                      </div>
                    )}
                  />
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Office Timings <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2 h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800">
                      <Clock size={14} className="text-slate-400 flex-shrink-0" />
                      <input {...register('officeStart', { required: true })} type="time" className="w-full bg-transparent border-0 p-0 text-slate-800 focus:ring-0 text-[13px] focus:outline-none cursor-pointer" />
                      <span className="text-slate-400 text-[11px] font-semibold uppercase px-1">to</span>
                      <input {...register('officeEnd', { required: true })} type="time" className="w-full bg-transparent border-0 p-0 text-slate-800 focus:ring-0 text-[13px] focus:outline-none cursor-pointer" />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className={isIndividualValue ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
              <div>
                <label htmlFor="phone" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"><Phone size={16} /></span>
                  <input
                    {...register('phone', {
                      required: 'Mobile number is required.',
                      pattern: { value: /^\d{10}$/, message: 'Enter a valid 10-digit mobile number.' },
                      validate: (v) => v !== '0000000000' || 'Invalid phone number.',
                      setValueAs: (v: any) => String(v ?? '').replace(/\D/g, '').slice(0, 10),
                    })}
                    id="phone" type="tel" inputMode="numeric" maxLength={10} onKeyDown={digitsOnlyKeyDown}
                    placeholder="10-digit mobile number"
                    className={`w-full h-[38px] pl-9 pr-24 border rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${errors.phone ? 'border-red-400 focus:ring-red-400/40' : 'border-slate-200 focus:ring-amber-400/40'}`}
                  />
                  {phoneVerified ? (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle size={14} /> Verified
                    </span>
                  ) : !phoneOtpSent ? (
                    <button
                      type="button" onClick={handleSendPhoneOtp} disabled={sendingOtp || !/^\d{10}$/.test(String(phoneValue || ''))}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-amber-600 hover:text-amber-800 disabled:text-slate-300 disabled:cursor-not-allowed px-2 py-1"
                    >
                      {sendingOtp ? <Loader2 size={13} className="animate-spin" /> : 'Send OTP'}
                    </button>
                  ) : null}
                </div>
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}

                {phoneOtpSent && !phoneVerified && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={otpValue}
                      onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={digitsOnlyKeyDown}
                      inputMode="numeric" maxLength={6} placeholder="Enter OTP"
                      className="w-full h-[34px] px-3 border border-slate-200 rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                    />
                    <button
                      type="button" onClick={handleVerifyPhoneOtp} disabled={verifyingOtp || !otpValue.trim()}
                      className="flex-shrink-0 inline-flex items-center gap-1 h-[34px] px-3 text-xs font-semibold rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {verifyingOtp ? <Loader2 size={13} className="animate-spin" /> : 'Verify'}
                    </button>
                    <button
                      type="button" onClick={handleSendPhoneOtp} disabled={sendingOtp}
                      className="flex-shrink-0 text-[11px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      Resend
                    </button>
                  </div>
                )}
              </div>

              {!isIndividualValue && (
                <div>
                  <label htmlFor="whatsapp" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    WhatsApp Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"><Phone size={16} /></span>
                    <input
                      {...whatsappReg}
                      id="whatsapp" type="tel" inputMode="numeric" maxLength={10}
                      onKeyDown={digitsOnlyKeyDown}
                      onChange={(e) => {
                        if (sameAsPhone) setValue('sameAsPhone', false);
                        whatsappReg.onChange(e);
                      }}
                      placeholder="Same as mobile number"
                      className={`w-full h-[38px] pl-9 pr-3 border rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${errors.whatsapp ? 'border-red-400 focus:ring-red-400/40' : 'border-slate-200 focus:ring-amber-400/40'}`}
                    />
                  </div>
                  {errors.whatsapp && <p className="mt-1 text-xs text-red-600">{errors.whatsapp.message}</p>}
                </div>
              )}
            </div>
            </>
          )}

          {modalStep === 'address' && (
            <div>
              <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Step 2 of 2</p>
              <label className="block text-sm font-semibold text-slate-800 mb-2">
                Confirm Your Office Location <span className="text-red-500">*</span>
              </label>
              <AddressLocationPicker
                value={{
                  flatNumber: watch('flatNumber'),
                  buildingName: watch('buildingName'),
                  area: watch('area'),
                  landmark: watch('landmark'),
                  city: watch('city'),
                  lat: watch('lat'),
                  lng: watch('lng'),
                  placeId: watch('placeId'),
                  formattedAddress: watch('formattedAddress'),
                }}
                initialSearchAddress={!isIndividualValue ? (watch('address') || '') : ''}
                onChange={(v: AddressLocationValue) => {
                  setValue('flatNumber', v.flatNumber, { shouldValidate: true });
                  setValue('buildingName', v.buildingName);
                  setValue('area', v.area);
                  setValue('landmark', v.landmark);
                  setValue('city', v.city);
                  setValue('lat', v.lat);
                  setValue('lng', v.lng);
                  setValue('placeId', v.placeId);
                  setValue('formattedAddress', v.formattedAddress);
                }}
                onResolvedRegion={(r) => {
                  // Individual accounts have no manual State input anywhere
                  // in this modal — always derive it from the resolved
                  // place. Business already has its own State input above
                  // (GST-driven, or manually typed in the fallback box), so
                  // only fill in here when still blank — never overwrite
                  // either of those.
                  if (r.state && !watch('state')) setValue('state', r.state);
                }}
              />
            </div>
          )}

          {modalStep === 'address' ? (
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button" onClick={() => setModalStep('details')}
                className="inline-flex items-center justify-center py-3 px-4 text-sm font-semibold rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Back
              </button>
              <button
                type="submit" disabled={submitting || !watch('lat') || !watch('flatNumber')?.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-base font-semibold rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed shadow-lg shadow-amber-500/40 transition-colors"
              >
                {submitting ? (<><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>) : 'Complete Profile & Continue'}
              </button>
            </div>
          ) : (
            <button
              type="button" disabled={!phoneVerified} onClick={handleContinueToAddress}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 text-base font-semibold rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed shadow-lg shadow-amber-500/40 transition-colors"
            >
              {!phoneVerified ? 'Verify Mobile Number to Continue' : 'Continue to Address'}
            </button>
          )}
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default CompleteTransporterProfileModal;
