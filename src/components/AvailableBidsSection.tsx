// src/components/AvailableBidsSection.tsx
//
// The bidding-marketplace list that used to be the whole of Dashboard.tsx —
// moved into a Profile section since /dashboard now shows the (actually
// working) direct-booking feed instead. Same fetch/render logic, unchanged.

import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import {
  RefreshCw, Clock, MapPin, Package, IndianRupee, ArrowRight, Bell,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { API_BASE_URL } from '../config/apiConfig'

axios.defaults.withCredentials = true

interface PopulatedUser {
  _id: string
  firstName: string
  lastName: string
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
  bidEndTime: string
  pickupDate: string
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

interface AvailableBidsSectionProps {
  isIndividualAccount: boolean
}

const AvailableBidsSection: React.FC<AvailableBidsSectionProps> = ({ isIndividualAccount }) => {
  const { user, isAuthenticated } = useAuth()
  const [openBids, setOpenBids] = useState<Bid[]>([])
  const [limitedBids, setLimitedBids] = useState<Bid[]>([])
  const [semiLimitedBids, setSemiLimitedBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBids = async () => {
    if (!user?._id) return
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

  useEffect(() => {
    if (isAuthenticated) fetchBids()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?._id])

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
                <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl shadow-sm hover:bg-blue-700 active:scale-95 transition-all">
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
        {isIndividualAccount ? (
          <Link to="/profile/rates" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700">
            Review your lane rates <ArrowRight size={12} />
          </Link>
        ) : (
          <Link to="/addprice" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700">
            Expand your service zones to unlock more bids <ArrowRight size={12} />
          </Link>
        )}
      </div>
    )

  const Section: React.FC<{ title: string; bids: Bid[] }> = ({ title, bids }) => {
    const theme = SECTION_THEME[title] || SECTION_THEME['Open Bids']
    return (
      <section className="mb-6 last:mb-0">
        <div className="mb-3 flex items-stretch h-9">
          <div className={`w-1 rounded-l-sm flex-shrink-0 ${theme.accent}`} />
          <h3 className="bg-slate-100 text-slate-800 text-sm font-bold flex items-center pl-4 pr-6 gap-2 select-none">
            {title}
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${theme.chip}`}>{bids.length}</span>
          </h3>
        </div>
        {renderList(bids, theme)}
      </section>
    )
  }

  const total = openBids.length + limitedBids.length + semiLimitedBids.length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {total} bid{total === 1 ? '' : 's'} matching your service zones
        </p>
        <button
          onClick={fetchBids}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && total === 0 ? (
        <div className="flex items-center justify-center py-10">
          <RefreshCw size={20} className="animate-spin text-blue-500 mr-2" />
          <p className="text-slate-500 text-sm font-medium">Loading bids…</p>
        </div>
      ) : error ? (
        <div className="p-4 text-center bg-red-50 border border-red-100 rounded-2xl">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button
            onClick={fetchBids}
            className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : total === 0 ? (
        <div className="text-center py-10 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
            <Bell size={18} />
          </div>
          <p className="text-slate-700 font-semibold text-sm">No bids yet</p>
          <p className="text-xs text-slate-400 mt-1">We'll notify you once one is added.</p>
        </div>
      ) : (
        <>
          <Section title="Open Bids" bids={openBids} />
          <Section title="Limited Bids" bids={limitedBids} />
          <Section title="Semi‑Limited Bids" bids={semiLimitedBids} />
        </>
      )}
    </div>
  )
}

export default AvailableBidsSection
