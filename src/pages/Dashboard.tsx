// src/pages/Dashboard.tsx

import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import {
  RefreshCw, Clock, MapPin, Package, IndianRupee, ArrowRight,
  Sparkles, X, ShieldCheck, Zap, Bell, Map as MapIcon, Truck as TruckIcon,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { API_BASE_URL } from '../config/apiConfig'
import { resolveTransporterLogo } from '../utils/transporterLogo'
import { useReportIframeHeight } from '../hooks/useReportIframeHeight'
import http from '../lib/http'

// ensure your authToken cookie is sent on every request
axios.defaults.withCredentials = true

// shape of the populated user returned by Mongoose
interface PopulatedUser {
  _id: string
  firstName: string
  lastName:string
  companyName: string
}

interface Bid {
  _id: string
  userId: PopulatedUser
  weightOfBox: number
  noofboxes: number
  length: number
  width: number
  height: number
  origin: number
  destination: number
  bidAmount: number
  bidEndTime: string   // ISO date string
  pickupDate: string   // ISO date string
  pickupTime: string
  status: 'pending' | 'accepted' | 'rejected'
  bidType: 'open' | 'limited' | 'semi-limited'
}

// ── Live countdown — ticks every second, color-coded by urgency ────────────
function useCountdown(endTime: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const end = new Date(endTime).getTime()
  const diffMs = end - now
  const expired = diffMs <= 0
  const totalMin = Math.max(0, Math.floor(diffMs / 60000))
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  const secs = Math.max(0, Math.floor((diffMs % 60000) / 1000))

  let label: string
  if (expired) label = 'Ended'
  else if (days > 0) label = `${days}d ${hours}h left`
  else if (hours > 0) label = `${hours}h ${mins}m left`
  else if (mins > 0) label = `${mins}m ${secs}s left`
  else label = `${secs}s left`

  // green > 24h, amber < 24h, red < 2h, grey expired
  const tier: 'safe' | 'soon' | 'urgent' | 'expired' = expired
    ? 'expired'
    : totalMin > 1440
      ? 'safe'
      : totalMin > 120
        ? 'soon'
        : 'urgent'

  return { label, tier, expired }
}

const TIER_CLASSES: Record<string, string> = {
  safe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  soon: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200 animate-pulse',
  expired: 'bg-slate-100 text-slate-400 border-slate-200',
}

function CountdownBadge({ endTime }: { endTime: string }) {
  const { label, tier } = useCountdown(endTime)
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${TIER_CLASSES[tier]}`}>
      <Clock size={11} /> {label}
    </span>
  )
}

const SECTION_THEME: Record<string, { accent: string; chip: string }> = {
  'Open Bids':        { accent: 'bg-blue-600',   chip: 'bg-blue-50 text-blue-700' },
  'Limited Bids':     { accent: 'bg-purple-600', chip: 'bg-purple-50 text-purple-700' },
  'Semi‑Limited Bids': { accent: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-700' },
}

const Dashboard: React.FC = () => {
  const { user, isAuthenticated } = useAuth()
  const [openBids, setOpenBids] = useState<Bid[]>([])
  const [limitedBids, setLimitedBids] = useState<Bid[]>([])
  const [semiLimitedBids, setSemiLimitedBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // First-login welcome banner — shown once per account, dismissible. Keyed
  // to the user id so it never reappears once dismissed, even across
  // sessions, but still shows fresh for a different transporter on the same
  // browser.
  const welcomeKey = user?._id ? `dashboard_welcome_seen_${user._id}` : null
  const [showWelcome, setShowWelcome] = useState(false)
  useEffect(() => {
    if (welcomeKey && !localStorage.getItem(welcomeKey)) setShowWelcome(true)
  }, [welcomeKey])
  const dismissWelcome = () => {
    if (welcomeKey) localStorage.setItem(welcomeKey, '1')
    setShowWelcome(false)
  }

  const fetchBids = async () => {
    if (!user?._id) {
      setError('No transporter ID available.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post<{
        success: boolean
        message: string
        data: {
          openBids: Bid[]
          limitedBids: Bid[]
          semiLimitedBids: Bid[]
        }
      }>(
        `${API_BASE_URL}/api/bidding/getbids`,
        { tid: user._id },
        { headers: { 'Content-Type': 'application/json' } }
      )

      const { openBids, limitedBids, semiLimitedBids } = res.data.data
      // The backend returns every matching bid regardless of whether its
      // bidding window has already closed — filter those out here so a
      // transporter with only stale/ended bids sees "no bids yet" instead
      // of a list of things they can no longer act on.
      const stillOpen = (bids: Bid[]) => bids.filter((b) => new Date(b.bidEndTime).getTime() > Date.now())
      setOpenBids(stillOpen(openBids))
      setLimitedBids(stillOpen(limitedBids))
      setSemiLimitedBids(stillOpen(semiLimitedBids))
    } catch (err) {
      console.error(err)
      setError('Failed to fetch bids.')
    } finally {
      setLoading(false)
    }
  }

  // Automatically fetch bids once we're authenticated
  useEffect(() => {
    if (isAuthenticated) fetchBids()
  }, [isAuthenticated, user?._id])

  // "Your Setup" summary card — asked for live 2026-09-22: "why is the
  // first thing here bids... should also be my routes my rates". The
  // underlying zone/rate data already existed (AddPrice.tsx writes it) but
  // nothing anywhere ever read it back, so a transporter had no way to see
  // their own setup without re-opening the full editor. This is a light
  // summary, not the full matrix — see backend price-summary endpoint.
  const [priceSummary, setPriceSummary] = useState<{ hasPriceCard: boolean; originZoneCount?: number; destinationRateCount?: number } | null>(null)
  useEffect(() => {
    if (!isAuthenticated) return
    http.get('/api/transporter/auth/price-summary')
      .then((res) => { if (res.data?.success) setPriceSummary(res.data) })
      .catch(() => setPriceSummary(null))
  }, [isAuthenticated])

  // Every OTHER page in this app (SignIn/SignUp/VerifyOtp/AddPrice) calls
  // this so the parent FreightCompare app can size the embedding iframe to
  // fit real content — this page never did, so after logging in the iframe
  // just kept whatever (much shorter) height the sign-in form had reported,
  // clipping most of this page's actual content. Reported live 2026-09-22
  // as "chopped crop, hidden UI". Deps cover every state that changes this
  // page's rendered height: which of the four return branches is active,
  // the welcome banner, and the bid counts/list length.
  useReportIframeHeight([isAuthenticated, loading, error, showWelcome, priceSummary, openBids.length, limitedBids.length, semiLimitedBids.length])

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="p-8 text-center bg-white rounded-2xl shadow-lg border border-slate-100">
          <p className="text-lg font-semibold text-red-600">
            Please log in to view bids.
          </p>
          <Link to="/transporter-signin">
            <button className="mt-4 px-6 py-2.5 font-semibold text-white bg-amber-600 rounded-xl shadow-sm hover:bg-amber-700 transition-colors">
              Go to Login
            </button>
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <RefreshCw size={28} className="mx-auto animate-spin text-amber-500 mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading bids…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-slate-50 min-h-screen">
        <div className="p-5 text-center bg-red-50 border border-red-100 rounded-2xl max-w-md mx-auto">
          <p className="text-red-700 font-medium">{error}</p>
          <button
            onClick={fetchBids}
            className="mt-4 px-4 py-2 font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const renderList = (bids: Bid[], theme: { accent: string; chip: string }) =>
    bids.length > 0 ? (
      <div className="space-y-3">
        {bids.map((b) => (
          <div
            key={b._id}
            className="relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.accent}`} />
            <div className="flex-grow min-w-0 pl-2">
              <div className="flex items-center flex-wrap gap-2 mb-2">
                <span className="font-bold text-base text-slate-900">
                  {b.userId.companyName}
                </span>
                <span className="text-xs text-slate-400">
                  {b.userId.firstName} {b.userId.lastName}
                </span>
                <CountdownBadge endTime={b.bidEndTime} />
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                  <IndianRupee size={12} className="text-blue-500" />
                  {b.bidAmount.toLocaleString('en-IN')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} className="text-slate-400" />
                  {b.origin} <ArrowRight size={10} className="text-slate-300" /> {b.destination}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Package size={12} className="text-slate-400" />
                  {b.noofboxes} box{b.noofboxes === 1 ? '' : 'es'} · {b.weightOfBox} kg
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} className="text-slate-400" />
                  Pickup {new Date(b.pickupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {b.pickupTime}
                </span>
              </div>
            </div>

            <div className="flex-shrink-0">
              <Link to={`/bidding/details/${b._id}`}>
                <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-xl shadow-sm hover:bg-amber-700 active:scale-95 transition-all">
                  View Details <ArrowRight size={14} />
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-center py-10 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
        <p className="text-slate-400 text-sm">No bids found in this category.</p>
        <Link to="/addprice" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-600 hover:text-amber-700">
          Expand your service zones to unlock more bids <ArrowRight size={12} />
        </Link>
      </div>
    );

  const Section: React.FC<{ title: string; bids: Bid[]; }> = ({ title, bids }) => {
    const theme = SECTION_THEME[title] || SECTION_THEME['Open Bids']
    return (
      <section className="mb-8">
        <div className="mb-3 flex items-stretch h-9">
          <div className={`w-1 rounded-l-sm flex-shrink-0 ${theme.accent}`} />
          <h2 className="bg-slate-100 text-slate-800 text-base font-bold flex items-center pl-4 pr-6 gap-2 select-none">
            {title}
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${theme.chip}`}>{bids.length}</span>
          </h2>
        </div>
        {renderList(bids, theme)}
      </section>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">

        {/* Your Setup — routes/zones + rate card + fleet size, with a real
            edit path. Deliberately first, above the welcome banner and
            Available Bids: this IS the transporter's own operation, bids
            are what comes TO them because of it, not the other way round. */}
        <div className="mb-6 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Your Setup</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <MapIcon size={12} /> Routes covered
              </div>
              <p className="text-lg font-black text-slate-900">
                {priceSummary?.hasPriceCard ? priceSummary.destinationRateCount ?? 0 : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <ShieldCheck size={12} /> Rate card
              </div>
              <p className="text-lg font-black text-slate-900">
                {priceSummary === null ? '—' : priceSummary.hasPriceCard ? 'Set up' : 'Not started'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <TruckIcon size={12} /> Fleet
              </div>
              <p className="text-lg font-black text-slate-900">
                {user?.noOfTrucks ? `${user.noOfTrucks} trucks` : '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/addprice" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors">
              <MapIcon size={13} /> {priceSummary?.hasPriceCard ? 'Edit routes & rates' : 'Add your routes & rates'}
            </Link>
            <Link to="/profile" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 hover:bg-slate-100 transition-colors">
              <Zap size={13} /> View full profile
            </Link>
          </div>
        </div>

        {/* First-login welcome banner */}
        {showWelcome && (
          <div className="relative mb-6 rounded-2xl overflow-hidden border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
            <button
              onClick={dismissWelcome}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Welcome to FreightCompare{user?.companyName ? `, ${user.companyName}` : ''}!
                </h2>
                <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                  Your profile is live — bids matching your service zones and pricing will appear below.
                  Keep your coverage and rates up to date to get matched with more shippers.
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {/* Both routes are real, working pages in this same app
                      (App.tsx: /addprice, /profile) — the "not ready yet"
                      disabled state here was stale, found live 2026-09-22. */}
                  <Link to="/addprice" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-white border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-50 transition-colors">
                    <ShieldCheck size={13} /> Review your price & zone config
                  </Link>
                  <Link to="/profile" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-white border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-50 transition-colors">
                    <Zap size={13} /> View your profile
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Own logo → network logo → initials fallback (shared resolver) */}
            {(() => {
              const logoSrc = resolveTransporterLogo({
                logoUrl: user?.logoUrl,
                networks: user?.networks,
                companyName: user?.companyName,
              });
              return logoSrc ? (
                <img
                  src={logoSrc}
                  alt={`${user?.companyName || 'Company'} logo`}
                  className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-200 shadow-sm flex-shrink-0"
                  draggable={false}
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {(user?.companyName?.[0] || 'C').toUpperCase()}
                </div>
              );
            })()}
          <div>
            {/* text-lg, not the original text-2xl/3xl — matches the native
                transporter dashboard's own heading scale (TransporterDashboardNative.tsx),
                reported live 2026-09-22 as feeling oversized next to it. */}
            <h1 className="text-lg font-black tracking-tight text-slate-900">
              Available Bids
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {openBids.length + limitedBids.length + semiLimitedBids.length} bid{(openBids.length + limitedBids.length + semiLimitedBids.length) === 1 ? '' : 's'} matching your service zones
            </p>
          </div>
          </div>
          <button
            onClick={fetchBids}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-xl shadow-sm hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>

        <main>
          {openBids.length + limitedBids.length + semiLimitedBids.length === 0 ? (
            <div className="text-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <Bell size={20} />
              </div>
              <p className="text-slate-700 font-semibold">No bids yet</p>
              <p className="text-sm text-slate-400 mt-1">We'll notify you once one is added.</p>
            </div>
          ) : (
            <>
              <Section title="Open Bids" bids={openBids} />
              <Section title="Limited Bids" bids={limitedBids} />
              <Section title="Semi‑Limited Bids" bids={semiLimitedBids} />
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
