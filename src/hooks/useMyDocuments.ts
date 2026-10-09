// The transporter's own view of everything they uploaded (KYC documents,
// fleet, rate files). One fetch, one refresh() — shared by the Profile
// "Documents" section and the Fleet page so both always show the same data.
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/apiConfig';

axios.defaults.withCredentials = true;

export type DocStatus = 'pending' | 'verified' | 'rejected';

export interface DocInfo {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  status: DocStatus;
  rejectionReason: string;
}

export interface PhotoGroupInfo {
  files: { fileId: string; fileName: string; mimeType: string; size: number }[];
  uploadedAt: string;
  status: DocStatus;
  rejectionReason: string;
}

export interface VehicleInfo {
  _id: string;
  vehicleNumber: string;
  vehicleType: string;
  isPrimary: boolean;
  addedAt: string;
  rc: DocInfo | null;
}

export interface DriverInfo {
  _id: string;
  name: string;
  phone: string;
  isPrimary: boolean;
  addedAt: string;
  dl: DocInfo | null;
}

export interface RateFileInfo {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  category: string;
  uploadedAt: string;
}

export interface MyDocuments {
  kycStatus: string;
  accountType: 'business' | 'individual';
  documents: {
    aadhaar: DocInfo | null;
    selfie: DocInfo | null;
    businessPhotos: PhotoGroupInfo | null;
  };
  vehicles: VehicleInfo[];
  drivers: DriverInfo[];
  rateFiles: RateFileInfo[];
}

export function useMyDocuments() {
  const [data, setData] = useState<MyDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await axios.get<MyDocuments>(`${API_BASE_URL}/api/transporter/kyc/my-documents`);
      setData(res.data);
      setError(null);
    } catch {
      setError('Could not load your documents. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

// Files live behind auth, so fetch as a blob and open that (a plain link would
// not carry the login). The tab is opened first so popup blockers allow it.
export async function openMyFile(fileId: string) {
  const tab = window.open('', '_blank');
  try {
    const res = await axios.get(`${API_BASE_URL}/api/transporter/kyc/my-file/${fileId}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    if (tab) tab.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    tab?.close();
    toast.error('Could not open this file. Please try again.');
  }
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

export const validateDocFile = (file: File): string | null => {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Only JPG, PNG or PDF files are allowed.';
  if (file.size > MAX_FILE_BYTES) return 'File must be 5 MB or smaller.';
  return null;
};

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
