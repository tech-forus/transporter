// transporter-main/src/components/LocationPermissionModal.tsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, MapPinOff } from 'lucide-react';
import browserPermissionPopup from '../assets/signup-location/browser-permission-popup.png';
import winStart from '../assets/signup-location/win-guide/win-start.png';
import winStartMenu from '../assets/signup-location/win-guide/win-start-menu.png';
import winSearchLocation from '../assets/signup-location/win-guide/win-search-location.png';
import winLocationToggle from '../assets/signup-location/win-guide/win-location-toggle.png';

// Only two phases for getCurrentPosition failures, deliberately — an earlier
// 'os-help' third phase (showing a generic "Windows might ask permission,
// click Yes" popup) was removed: real-world testing showed Edge instead shows
// its own "Location is turned off in system settings" flyout (Manage/System
// settings buttons) that doesn't match that generic guidance at all, and
// Chrome's actual getCurrentPosition error CODES don't reliably distinguish
// "OS off" from "site blocked" either. Every getCurrentPosition failure
// routes to 'os-settings-guide' — one robust, always-actionable fallback
// beats three narrow phases that each only match one specific browser's
// specific popup wording.
//
// 'site-blocked' is different: it's set BEFORE calling getCurrentPosition at
// all, from navigator.permissions.query({name:'geolocation'}) — that API
// (unlike the getCurrentPosition error code) DOES reliably report a genuine
// site-level block ('denied'), so a real site block gets its own accurate
// message instead of being funneled into the OS-settings guide, where
// flipping Windows toggles the user already has on would visibly do nothing.
export type LocationPermissionPhase = 'primer' | 'os-settings-guide' | 'site-blocked';

interface LocationPermissionModalProps {
  open: boolean;
  phase: LocationPermissionPhase;
  onClose: () => void;
  /** Only used by 'os-settings-guide' step 3 — retries requestLocation()
   *  after the user says they've turned Location Services on. */
  onRetry?: () => void;
}

// Small white arrow with a dark drop-shadow so it stays legible over both
// light illustration backgrounds and photo-like screenshots — literal white
// per instruction, with just enough contrast treatment to still be visible.
const WhiteArrow: React.FC<{ style?: React.CSSProperties; rotate?: number; size?: number }> = ({ style, rotate = 0, size = 30 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className="absolute pointer-events-none"
    style={{ ...style, transform: `rotate(${rotate}deg)` }}
  >
    <path
      d="M2 12h16m0 0-6-6m6 6-6 6"
      fill="none"
      stroke="white"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.65))' }}
    />
  </svg>
);

// Bold white highlight box — pixel-measured against the two source images
// (not eyeballed) so it sits symmetrically around the real button rather
// than drifting off it. White (not a color) so it actually shows up against
// these screenshots' dark/light backgrounds; a thin dark halo keeps it
// visible if it ever sits over a light patch of the OS dialog too.
const HighlightBox: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div
    className="absolute rounded-lg border-4 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_14px_3px_rgba(255,255,255,0.6)] animate-pulse pointer-events-none"
    style={style}
  />
);

// Real reference screenshots (not redrawn mockups — the audience is
// non-technical and needs to recognize the actual popup, not an
// approximation of it). Each renders inside a fixed-aspect-ratio box so the
// percentage-based highlight/arrow overlay always lands on the right button
// regardless of the final rendered size. Highlight coordinates below were
// measured by sampling the source PNGs' pixels directly (button edges =
// color transitions), not estimated by eye — see the 2026-09-24 spec
// addendum for the exact pixel bounds each percentage comes from.
const BrowserPermissionShot: React.FC = () => (
  <div className="w-full mx-auto" style={{ maxWidth: 380 }}>
    <div className="relative w-full" style={{ aspectRatio: '358 / 118' }}>
      <img
        src={browserPermissionPopup}
        alt="Browser location permission popup with Block, Just this time, and Allow buttons — click Allow"
        className="absolute inset-0 w-full h-full object-contain rounded-lg border border-slate-200 shadow-sm"
      />
      {/* Real "Allow" button bounds: x 274–344 of 358 (76.5%–96.1%), y 69–108
          of 118 (58.5%–91.5%) — padded evenly (~2–3pt each side) for a halo. */}
      <HighlightBox style={{ left: '74%', top: '55%', width: '24%', height: '39%' }} />
      <WhiteArrow style={{ left: '58%', top: '86%' }} rotate={-30} />
    </div>
  </div>
);

// Real, FULL, uncropped screenshots of this exact Windows 11 machine's Start
// menu / Search / Settings flow (user-supplied — explicitly full frames, not
// cropped to a sub-region, per instruction: showing the whole real window
// is what makes it recognizable to a first-time user, even though a tight
// crop would render the target text larger for the same box size). PII
// pixel-blurred where needed — see win-search-location.png. Each renders in
// an explicit pixel-sized box — deliberately NOT an aspect-ratio +
// max-width combo, which would let the browser letterbox the image inside a
// differently-shaped box and throw off the percentage-based highlight/arrow
// overlay (percentages are relative to this container, so the container
// must exactly match the image's own rendered bounds, no letterbox gap).
// `fitBox` below computes that exact box once per image so every one fits
// within the same row envelope while preserving its native aspect ratio —
// coordinates were measured by sampling each full PNG's pixels directly
// (control edges = color transitions), not estimated by eye.
function fitBox(nativeW: number, nativeH: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / nativeW, maxH / nativeH);
  return { width: Math.round(nativeW * scale), height: Math.round(nativeH * scale) };
}

const ROW_IMAGE_MAX_W = 700;
const ROW_IMAGE_MAX_H = 230;

interface WinStepShotProps {
  src: string;
  alt: string;
  nativeW: number;
  nativeH: number;
  highlight: React.CSSProperties;
  arrow?: { style: React.CSSProperties; rotate?: number };
}

const WinStepShot: React.FC<WinStepShotProps> = ({ src, alt, nativeW, nativeH, highlight, arrow }) => {
  const { width, height } = fitBox(nativeW, nativeH, ROW_IMAGE_MAX_W, ROW_IMAGE_MAX_H);
  return (
    <div className="relative flex-shrink-0" style={{ width, height }}>
      <img src={src} alt={alt} className="absolute inset-0 w-full h-full object-contain rounded-lg border border-slate-200 shadow-sm bg-white" />
      <HighlightBox style={highlight} />
      {arrow && <WhiteArrow style={arrow.style} rotate={arrow.rotate} />}
    </div>
  );
};

const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({ open, phase, onClose, onRetry }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`relative bg-white rounded-2xl shadow-2xl overflow-y-auto ${phase === 'os-settings-guide' ? 'w-[95vw] max-w-[1250px] max-h-[95vh] p-8' : 'w-full max-w-md p-6'}`}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>

            {phase === 'site-blocked' ? (
              <>
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-red-50 border-4 border-red-100 flex items-center justify-center">
                    <MapPinOff className="text-red-500" size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Location is blocked for this site</h3>
                  <p className="text-base text-slate-500">
                    Your device's location is on — but this website specifically has been blocked from using it,
                    probably from an earlier "Block" click. Turning Windows settings on/off won't fix this; it has
                    to be reset in the browser itself:
                  </p>
                  <ol className="text-sm text-slate-600 text-left space-y-1.5 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 w-full">
                    <li>1. Click the lock/location icon at the left of your browser's address bar.</li>
                    <li>2. Find "Location" in the list and change it from Block to Allow (or "Ask").</li>
                    <li>3. Come back here and click Retry below.</li>
                  </ol>
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 text-base font-semibold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  Retry
                </button>
              </>
            ) : phase === 'os-settings-guide' ? (
              <>
                <h3 className="text-2xl font-bold text-slate-800 pr-10">Turn on Location Services</h3>
                <p className="text-base text-slate-500 mt-2 mb-6">
                  We couldn't get your location — this usually means Location Services is off on your device.
                  Follow these 4 steps in your PC's Settings, then come back and try again.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                    <div className="flex-shrink-0 w-64">
                      <p className="text-base font-bold text-slate-700">Click Start</p>
                      <p className="text-sm text-slate-500 mt-1 leading-snug">
                        Click the <span className="font-semibold text-slate-700">Start</span> button in your taskbar
                      </p>
                    </div>
                    {/* Start button: x 9–60 of 340 (2.6%–17.6%), full height */}
                    <WinStepShot
                      src={winStart}
                      alt="Windows taskbar with the Start button highlighted"
                      nativeW={340}
                      nativeH={52}
                      highlight={{ left: '1%', top: '6%', width: '17%', height: '88%' }}
                      arrow={{ style: { left: '4%', top: '90%' }, rotate: -70 }}
                    />
                  </div>

                  <div className="flex items-center gap-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                    <div className="flex-shrink-0 w-64">
                      <p className="text-base font-bold text-slate-700">Open Settings</p>
                      <p className="text-sm text-slate-500 mt-1 leading-snug">
                        Click <span className="font-semibold text-slate-700">Settings</span> (not pinned? type{' '}
                        <span className="font-semibold text-slate-700">settings</span> in search and click{' '}
                        <span className="font-semibold text-slate-700">Open</span>)
                      </p>
                    </div>
                    {/* Settings tile: x 40–125 of 765 (5.2%–16.3%), y 265–330 of 352 (75.3%–93.8%) */}
                    <WinStepShot
                      src={winStartMenu}
                      alt="Start menu with the pinned Settings app highlighted"
                      nativeW={765}
                      nativeH={352}
                      highlight={{ left: '3%', top: '73%', width: '15%', height: '23%' }}
                      arrow={{ style: { left: '22%', top: '85%' }, rotate: 180 }}
                    />
                  </div>

                  <div className="flex items-center gap-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                    <div className="flex-shrink-0 w-64">
                      <p className="text-base font-bold text-slate-700">Find Location settings</p>
                      <p className="text-sm text-slate-500 mt-1 leading-snug">
                        Type <span className="font-semibold text-slate-700">location</span>, click{' '}
                        <span className="font-semibold text-slate-700">Location privacy settings</span>
                      </p>
                    </div>
                    {/* "Location privacy settings" row: x 645–1272 of 1282 (50.3%–99.2%), y 108–162 of 792 (13.6%–20.5%) */}
                    <WinStepShot
                      src={winSearchLocation}
                      alt="Settings search for location with Location privacy settings highlighted"
                      nativeW={1282}
                      nativeH={792}
                      highlight={{ left: '50%', top: '13%', width: '49%', height: '8%' }}
                      arrow={{ style: { left: '38%', top: '22%' }, rotate: -10 }}
                    />
                  </div>

                  <div className="flex items-center gap-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">4</div>
                    <div className="flex-shrink-0 w-64">
                      <p className="text-base font-bold text-slate-700">Turn it on</p>
                      <p className="text-sm text-slate-500 mt-1 leading-snug">
                        Tap the <span className="font-semibold text-slate-700">Location services</span> switch
                      </p>
                    </div>
                    {/* "Location services" toggle: x 1165–1266 of 1302 (89.5%–97.2%), y 250–282 of 406 (61.6%–69.5%) */}
                    <WinStepShot
                      src={winLocationToggle}
                      alt="Windows Location settings page with the Location services toggle highlighted"
                      nativeW={1302}
                      nativeH={406}
                      highlight={{ left: '87%', top: '58%', width: '11%', height: '14%' }}
                      arrow={{ style: { left: '78%', top: '45%' }, rotate: 54 }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 text-base font-semibold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  Use my current location
                </button>
                <p className="text-sm text-slate-400 mt-4 text-center">
                  Already on? It may also be blocked for just this site — click the location icon in your
                  browser's address bar and allow it there too.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-slate-800 pr-6">Allow location access</h3>
                <p className="text-base text-slate-500 mt-2 mb-5">
                  Click <span className="font-semibold text-slate-700">Allow</span> in the popup near your
                  browser's address bar so we can pinpoint your pickup location.
                </p>
                <div className="flex justify-center py-2">
                  <BrowserPermissionShot />
                </div>
              </>
            )}

            <div className={`flex items-start gap-2.5 rounded-lg bg-indigo-50 border border-indigo-100 ${phase === 'os-settings-guide' ? 'mt-6 px-4 py-3' : 'mt-5 px-3 py-2.5'}`}>
              <ShieldCheck size={phase === 'os-settings-guide' ? 20 : 15} className="text-indigo-500 flex-shrink-0 mt-0.5" />
              <p className={`text-indigo-800 leading-snug ${phase === 'os-settings-guide' ? 'text-sm' : 'text-[11px]'}`}>
                Don't worry — we only use this to get your pickup location right. We don't store or share it
                beyond that.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LocationPermissionModal;
