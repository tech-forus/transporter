// src/components/LiveSelfieCapture.tsx
// Camera-only capture (no gallery upload) for the KYC wizard's selfie step —
// unlike the business-location photo step, this one must be a genuinely live
// shot for identity verification, so there's no file-picker fallback here.
//
// Camera access is NEVER requested automatically on mount — for a
// non-technical user, a browser permission popup appearing with no warning
// is confusing, and a missed/dismissed prompt then shows a scary error with
// no obvious way to retry. Instead this always starts on an explainer
// screen with a big "Turn On Camera" button; the getUserMedia call only
// fires from that direct tap, and any failure shows plain-language
// instructions plus a "Try Again" button in the same spot.
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, RotateCcw, CheckCircle2, ShieldCheck } from 'lucide-react';

interface LiveSelfieCaptureProps {
  capturedFile: File | null;
  onCapture: (file: File) => void;
  onRetake: () => void;
}

type CameraState = 'prompt' | 'requesting' | 'ready' | 'unsupported' | 'error';

export default function LiveSelfieCapture({ capturedFile, onCapture, onRetake }: LiveSelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const permissionGrantedRef = useRef(false);
  const [cameraState, setCameraState] = useState<CameraState>('prompt');
  const [videoReady, setVideoReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Only ever called from a direct user tap (the explainer's button, or
  // "Try Again" after a failure) — never automatically.
  const requestCamera = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported');
      return;
    }
    setVideoReady(false);
    setCameraState('requesting');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        permissionGrantedRef.current = true;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setVideoReady(true);
        }
        setCameraState('ready');
      })
      .catch(() => {
        setCameraState('error');
      });
  }, []);

  // Release the camera whenever this component unmounts, whatever state
  // it's in — never leave it running in the background.
  useEffect(() => stopStream, []);

  // After a retake, permission is already granted (browsers remember it for
  // the site), so skip straight back to the camera instead of the explainer.
  useEffect(() => {
    if (!capturedFile && permissionGrantedRef.current) {
      requestCamera();
    }
  }, [capturedFile, requestCamera]);

  // Builds/revokes the preview object URL only when the captured file
  // actually changes — doing this in render would leak a new URL every
  // re-render.
  useEffect(() => {
    if (!capturedFile) {
      setPreviewUrl(null);
      return;
    }
    stopStream();
    const url = URL.createObjectURL(capturedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [capturedFile]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('Could not capture the photo — please try again.');
          return;
        }
        const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopStream();
        onCapture(file);
      },
      'image/jpeg',
      0.9
    );
  };

  if (capturedFile) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl overflow-hidden border border-slate-200">
          {previewUrl && (
            <img src={previewUrl} alt="Captured selfie" className="w-full aspect-square object-cover" />
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
            <CheckCircle2 size={16} /> Selfie captured
          </span>
          <button
            type="button"
            onClick={onRetake}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold"
          >
            <RotateCcw size={14} /> Retake
          </button>
        </div>
      </div>
    );
  }

  if (cameraState === 'prompt') {
    return (
      <div className="text-center bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
          <Camera className="text-blue-600" size={24} />
        </div>
        <div>
          <p className="font-semibold text-slate-800">We need to turn on your camera</p>
          <p className="text-sm text-slate-500 mt-1">
            Tap the button below. Your browser will then show its own popup asking for camera permission —
            tap <span className="font-semibold text-slate-700">"Allow"</span> on that popup.
          </p>
        </div>
        <button
          type="button"
          onClick={requestCamera}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all"
        >
          <Camera size={18} /> Turn On Camera
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck size={13} /> Only one photo is taken — nothing is recorded.
        </p>
      </div>
    );
  }

  if (cameraState === 'unsupported') {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-center">
        Live camera capture isn't supported on this browser. Please try again from a phone or a browser like Chrome.
      </div>
    );
  }

  if (cameraState === 'error') {
    return (
      <div className="text-center bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
        <p className="text-sm text-red-700 font-medium">We couldn't turn on your camera.</p>
        <p className="text-xs text-red-500">
          Look for a camera icon in your browser's address bar and tap it to allow access — or check that no other app is using your camera — then try again.
        </p>
        <button
          type="button"
          onClick={requestCamera}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  // cameraState === 'requesting' | 'ready' — video element must already be
  // mounted before the getUserMedia promise resolves so the ref is set.
  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-square flex items-center justify-center">
        {/* Preview is mirrored (natural "looking in a mirror" feel) via CSS
            only — the captured canvas frame is drawn from the raw,
            unmirrored video track, so the saved file isn't flipped. */}
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
      </div>
      <button
        type="button"
        onClick={handleCapture}
        disabled={!videoReady}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
      >
        <Camera size={18} /> {videoReady ? 'Capture Selfie' : 'Starting camera...'}
      </button>
    </div>
  );
}
