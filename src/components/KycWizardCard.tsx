// src/components/KycWizardCard.tsx
// The KYC wizard's actual card UI — extracted so it can render both as a
// standalone page (TransporterKycPage.tsx, linked from the exempt-account
// nudge banner) and as a blocking overlay on top of a blurred page
// (KycGate.tsx). Presentational + self-contained data fetching; the two
// hosts differ only in what happens after a successful submit (`onComplete`).
import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, Upload, CheckCircle2, X, FileText, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import LiveSelfieCapture from './LiveSelfieCapture';

axios.defaults.withCredentials = true;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const ACCEPTED_ACCEPT_ATTR = '.jpg,.jpeg,.png,.pdf';
const MIN_BUSINESS_PHOTOS = 3;

// Indian RC formats: standard (e.g. MH12AB1234) or Bharat series (e.g.
// 22BH1234AB) — mirrors the backend's validateVehicleFields in
// transporterKycController.js. Client-side check is UX only; the backend is
// authoritative and re-validates on submit.
const VEHICLE_NUMBER_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$|^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;
const MAX_VEHICLE_NUMBER_LEN = 11; // longest valid plain form, see transporterModel.js's minlength/maxlength comment
const MIN_VEHICLE_NUMBER_JUDGE_LEN = 8; // don't show a red "invalid" state before they've typed enough to plausibly judge
const MAX_VEHICLE_TYPE_LEN = 30;

// Strips anything that isn't A-Z/0-9 and caps length — blocks spaces,
// symbols, and lowercase from ever landing in the stored (plain, unspaced)
// value, which is what's validated/submitted.
const sanitizeVehicleNumberInput = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_VEHICLE_NUMBER_LEN);

// Inserts a space at every letter<->digit boundary for display only (e.g.
// "GJ11Z7777" -> "GJ 11 Z 7777", "22BH1234AB" -> "22 BH 1234 AB") — works
// for both plate formats without hardcoding fixed segment lengths, since
// both alternate letter/digit blocks. The stored/submitted value stays the
// plain, unspaced form.
const formatVehicleNumberDisplay = (plain: string): string => {
  let out = '';
  let prevIsDigit: boolean | null = null;
  for (const ch of plain) {
    const isDigit = /[0-9]/.test(ch);
    if (prevIsDigit !== null && isDigit !== prevIsDigit) out += ' ';
    out += ch;
    prevIsDigit = isDigit;
  }
  return out;
};

type SingleDocStatus = { fileName: string; uploadedAt: string; status: string; rejectionReason: string } | null;
type PhotoGroupStatus = { fileCount: number; uploadedAt: string; status: string; rejectionReason: string } | null;

interface KycStatusResponse {
  kycStatus: string;
  // What is already on file for the primary vehicle / driver, so a re-upload does not start blank.
  vehicle?: { vehicleNumber: string; vehicleType: string } | null;
  driver?: { name: string; phone: string } | null;
  documents: {
    aadhaar: SingleDocStatus;
    selfie: SingleDocStatus;
    businessPhotos: PhotoGroupStatus;
    vehicleRc: SingleDocStatus;
    driverDl: SingleDocStatus;
  };
}

type SingleFileKey = 'aadhaar' | 'selfie' | 'vehicleRc' | 'driverDl';

interface StepDef {
  key: SingleFileKey | 'businessPhotos';
  title: string;
  description: string;
}

const STEPS: StepDef[] = [
  { key: 'aadhaar', title: 'Aadhaar Card', description: "Upload the company representative's Aadhaar card." },
  { key: 'selfie', title: 'Live Selfie', description: "Take a live selfie of the same person right now, for identity verification against the Aadhaar card — this must be captured live, not uploaded from your gallery." },
  { key: 'businessPhotos', title: 'Business Location Photos', description: `Upload at least ${MIN_BUSINESS_PHOTOS} photos of your office/warehouse from different angles — camera capture or file upload, either is fine.` },
  { key: 'vehicleRc', title: 'Vehicle RC', description: 'Registration Certificate of one vehicle. You can add more vehicles later from your profile.' },
  { key: 'driverDl', title: 'Driver DL', description: "One driver's license. You can add more drivers later from your profile." },
];

const validateFile = (file: File): string | null => {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Only JPG, PNG, or PDF files are allowed.';
  if (file.size > MAX_FILE_BYTES) return 'File must be 5MB or smaller.';
  return null;
};

// Small reference thumbnail shown on the Live Selfie step, reminding a
// non-technical user what they're matching their face against — manages its
// own object-URL lifecycle so callers don't have to.
function AadhaarPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith('image/')) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
      {url ? (
        <img src={url} alt="Your uploaded Aadhaar card" className="w-14 h-14 object-cover rounded-lg border border-slate-200 flex-none" />
      ) : (
        <div className="w-14 h-14 rounded-lg border border-slate-200 bg-white flex items-center justify-center flex-none">
          <FileText className="text-slate-400" size={22} />
        </div>
      )}
      <p className="text-xs text-slate-500">
        This is the Aadhaar card you just submitted — make sure your face in the selfie matches this person.
      </p>
    </div>
  );
}

interface KycWizardCardProps {
  onComplete: () => void;
}

export default function KycWizardCard({ onComplete }: KycWizardCardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  // Only the documents that need attention (missing or rejected). A brand-new account needs all five.
  const [steps, setSteps] = useState<StepDef[]>(STEPS);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [priorStatus, setPriorStatus] = useState<KycStatusResponse | null>(null);
  const [singleFiles, setSingleFiles] = useState<Record<SingleFileKey, File | null>>({
    aadhaar: null,
    selfie: null,
    vehicleRc: null,
    driverDl: null,
  });
  const [businessPhotos, setBusinessPhotos] = useState<File[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch current status once on mount. A returning transporter is only asked for the document(s)
  // that are missing or were rejected; verified and under-review ones are left out entirely.
  useEffect(() => {
    axios
      .get<{ success: boolean } & KycStatusResponse>(`${API_BASE_URL}/api/transporter/kyc/status`)
      .then(({ data }) => {
        setPriorStatus(data);
        const needed = STEPS.filter((s) => {
          const doc = data.documents?.[s.key];
          return !doc || doc.status === 'rejected';
        });
        if (needed.length > 0) setSteps(needed);
        setStepIndex(0);
        // Start from what is already on file instead of blank fields.
        if (data.vehicle) {
          setVehicleNumber(sanitizeVehicleNumberInput(data.vehicle.vehicleNumber || ''));
          setVehicleType((data.vehicle.vehicleType || '').slice(0, MAX_VEHICLE_TYPE_LEN));
        }
        if (data.driver) {
          setDriverName(data.driver.name || '');
          setDriverPhone(data.driver.phone || '');
        }
      })
      .catch(() => {
        // No prior status (brand-new account) — all five steps, starting at the first.
      })
      .finally(() => setLoadingStatus(false));
  }, []);

  const step = steps[stepIndex];
  const partial = steps.length < STEPS.length;
  const priorDoc = priorStatus?.documents[step.key] ?? null;
  const rejectedReason = priorDoc?.status === 'rejected' ? priorDoc.rejectionReason : null;
  const alreadyVerified = priorDoc?.status === 'verified';

  const handleSingleFileChange = (key: SingleFileKey, fileList: FileList | null) => {
    const file = fileList?.[0] || null;
    if (file) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }
    }
    setSingleFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleAddBusinessPhotos = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const validFiles: File[] = [];
    for (const file of Array.from(fileList)) {
      const error = validateFile(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length > 0) {
      setBusinessPhotos((prev) => [...prev, ...validFiles]);
    }
  };

  const removeBusinessPhoto = (index: number) => {
    setBusinessPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const canAdvance = (): boolean => {
    if (step.key === 'businessPhotos') {
      if (!alreadyVerified && businessPhotos.length < MIN_BUSINESS_PHOTOS) {
        toast.error(`Please upload at least ${MIN_BUSINESS_PHOTOS} photos (${businessPhotos.length} selected).`);
        return false;
      }
      return true;
    }

    // A document an admin has already verified never needs re-picking — the
    // backend leaves it untouched when it's omitted from the submission.
    if (!alreadyVerified && !singleFiles[step.key]) {
      toast.error(`Please upload the ${step.title.toLowerCase()}.`);
      return false;
    }
    if (step.key === 'vehicleRc') {
      const normalized = vehicleNumber.trim().toUpperCase().replace(/[\s-]/g, '');
      if (!normalized) {
        toast.error('Please enter the vehicle number.');
        return false;
      }
      if (!VEHICLE_NUMBER_RE.test(normalized)) {
        toast.error('Enter a valid vehicle registration number (e.g., MH12AB1234).');
        return false;
      }
    }
    if (step.key === 'driverDl' && !driverName.trim()) {
      toast.error("Please enter the driver's name.");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!canAdvance()) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const handleSubmit = async () => {
    if (!canAdvance()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      // Only send files actually picked — appending a null would post the
      // literal string "null" and the backend would treat it as an upload.
      if (singleFiles.aadhaar) formData.append('aadhaar', singleFiles.aadhaar);
      if (singleFiles.selfie) formData.append('selfie', singleFiles.selfie);
      businessPhotos.forEach((file) => formData.append('businessPhotos', file));
      if (singleFiles.vehicleRc) formData.append('vehicleRc', singleFiles.vehicleRc);
      if (singleFiles.driverDl) formData.append('driverDl', singleFiles.driverDl);
      // Vehicle / driver details travel only with the RC / DL they belong to.
      if (steps.some((s) => s.key === 'vehicleRc')) {
        formData.append('vehicleNumber', vehicleNumber.trim().toUpperCase().replace(/[\s-]/g, ''));
        formData.append('vehicleType', vehicleType);
      }
      if (steps.some((s) => s.key === 'driverDl')) {
        formData.append('driverName', driverName);
        formData.append('driverPhone', driverPhone);
      }

      const { data } = await axios.post(`${API_BASE_URL}/api/transporter/kyc/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (data.success) {
        toast.success('KYC documents submitted!');
        onComplete();
      } else {
        toast.error(data.message || 'Submission failed.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="max-w-lg w-full mx-auto p-6 bg-white rounded-2xl shadow-lg border border-slate-200/60 text-center text-gray-600">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-lg w-full mx-auto p-6 bg-white rounded-2xl shadow-lg border border-slate-200/60 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{partial ? 'Re-upload Your Documents' : 'Complete Your KYC'}</h2>
        <p className="text-sm text-slate-500">Step {stepIndex + 1} of {steps.length}</p>
        {partial && (
          <p className="mt-1 text-xs text-slate-400">
            {steps.length} document{steps.length === 1 ? '' : 's'} need{steps.length === 1 ? 's' : ''} to be uploaded again. The rest are already verified or under review.
          </p>
        )}
      </div>

      {/* Progress indicator */}
      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <div
            key={s.key}
            className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-blue-600' : 'bg-slate-200'}`}
          />
        ))}
      </div>

      <div>
        <h3 className="font-bold text-slate-800">{step.title}</h3>
        <p className="text-sm text-slate-500 mt-1">{step.description}</p>
        {rejectedReason && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
            Rejected: {rejectedReason} — please re-upload.
          </p>
        )}
      </div>

      {(step.key === 'vehicleRc') && (
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input
              value={formatVehicleNumberDisplay(vehicleNumber)}
              onChange={(e) => setVehicleNumber(sanitizeVehicleNumberInput(e.target.value))}
              placeholder="e.g., GJ 11 Z 7777"
              inputMode="text"
              autoCapitalize="characters"
              className="w-full px-3 py-2.5 pr-9 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {vehicleNumber.length > 0 && (
              VEHICLE_NUMBER_RE.test(vehicleNumber) ? (
                <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-600" size={18} />
              ) : vehicleNumber.length >= MIN_VEHICLE_NUMBER_JUDGE_LEN ? (
                <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500" size={18} />
              ) : null
            )}
          </div>
          <input
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            placeholder="Vehicle type (optional)"
            maxLength={MAX_VEHICLE_TYPE_LEN}
            className="px-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {(step.key === 'driverDl') && (
        <div className="grid grid-cols-2 gap-3">
          <input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Driver name"
            className="px-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            placeholder="Driver phone (optional)"
            className="px-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {step.key === 'selfie' ? (
        <div className="space-y-3">
          {singleFiles.aadhaar && <AadhaarPreview file={singleFiles.aadhaar} />}
          <LiveSelfieCapture
            capturedFile={singleFiles.selfie}
            onCapture={(file) => setSingleFiles((prev) => ({ ...prev, selfie: file }))}
            onRetake={() => setSingleFiles((prev) => ({ ...prev, selfie: null }))}
          />
        </div>
      ) : step.key === 'businessPhotos' ? (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-8 px-4 cursor-pointer hover:border-blue-400 transition-colors">
            <input
              type="file"
              accept={ACCEPTED_ACCEPT_ATTR}
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAddBusinessPhotos(e.target.files);
                e.target.value = '';
              }}
            />
            <Upload className="text-slate-400" size={28} />
            <span className="text-sm text-slate-500">
              Tap to add photos (JPG, PNG, or PDF — max 5MB each)
            </span>
            <span className="text-xs font-medium text-slate-400">
              {businessPhotos.length} of at least {MIN_BUSINESS_PHOTOS} added
            </span>
          </label>

          {businessPhotos.length > 0 && (
            <ul className="space-y-1.5">
              {businessPhotos.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-slate-700 truncate">
                    <CheckCircle2 className="text-green-600 flex-none" size={16} />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBusinessPhoto(i)}
                    className="text-slate-400 hover:text-red-600 flex-none"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-8 px-4 cursor-pointer hover:border-blue-400 transition-colors">
          <input
            type="file"
            accept={ACCEPTED_ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => handleSingleFileChange(step.key as 'aadhaar' | 'vehicleRc' | 'driverDl', e.target.files)}
          />
          {singleFiles[step.key as 'aadhaar' | 'vehicleRc' | 'driverDl'] ? (
            <>
              <CheckCircle2 className="text-green-600" size={28} />
              <span className="text-sm font-medium text-slate-700">{singleFiles[step.key as 'aadhaar' | 'vehicleRc' | 'driverDl']?.name}</span>
              <span className="text-xs text-slate-400">Tap to replace</span>
            </>
          ) : (
            <>
              <Upload className="text-slate-400" size={28} />
              <span className="text-sm text-slate-500">Tap to upload (JPG, PNG, or PDF — max 5MB)</span>
            </>
          )}
        </label>
      )}

      <div className="flex gap-3">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={submitting}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
        >
          {submitting ? (
            <><Loader2 className="animate-spin" size={18} /> Submitting...</>
          ) : stepIndex < steps.length - 1 ? 'Next' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
