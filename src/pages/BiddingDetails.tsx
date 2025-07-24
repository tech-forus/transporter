// src/pages/BiddingDetails.tsx

import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../hooks/useAuth'

// --- TypeScript interfaces matching your schema ---
interface User {
  _id: string
  firstName: string
  lastName: string
  name: string // if applicable
  email: string
}

interface Transporter {
  _id: string
  companyName: string
  rating: number
}

interface BidEntry {
  transporter: Transporter
  amount: number
  bidTime: string
}

interface BiddingDetail {
  _id: string
  userId: User
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
  bidType: 'limited' | 'semi-limited' | 'open'
  transporterRating?: number
  bidders: Transporter[]
  bids: BidEntry[]
  createdAt: string
  updatedAt: string
}

const InfoCard: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
      <div className="p-5 border-b border-gray-200 bg-gray-50">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center">
          {icon && <span className="mr-3 text-gray-500">{icon}</span>}
          {title}
        </h2>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
);

const DetailItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-base text-gray-900">{value}</dd>
    </div>
);


export const BiddingDetails: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const { user } = useAuth()
    const [bid, setBid] = useState<BiddingDetail | null>(null)
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [newBidAmount, setNewBidAmount] = useState<number | ''>('')
    const [submitting, setSubmitting] = useState<boolean>(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const fetchDetail = async () => {
        setLoading(true)
        setError(null)
        if (!id) {
            setError('No bid ID provided in URL.')
            setLoading(false)
            return
        }
        try {
            const res = await axios.get<{
                success: boolean
                message: string
                data: BiddingDetail
            }>(
                `https://backend-bcxr.onrender.com/api/bidding/details/${id}`,
                { withCredentials: true }
            )
            if (!res.data.success) {
                throw new Error(res.data.message || 'Failed to fetch bid detail.')
            }
            setBid(res.data.data)
            // Pre-fill bid amount if a minimum is specified
            setNewBidAmount(res.data.data.bidAmount);

        } catch (err: any) {
            console.error(err)
            setError(err.response?.data?.message || err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if(id) fetchDetail()
    }, [id])


    const handleBidSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user?._id) {
            setSubmitError('You must be logged in to place a bid.')
            return
        }
        if (!newBidAmount || newBidAmount <= 0) {
            setSubmitError('Please enter a valid bid amount.')
            return
        }
        setSubmitting(true)
        setSubmitError(null)
        try {
            await axios.post(
                `https://backend-bcxr.onrender.com/api/bidding/${id}/bid`,
                { transporterId: user._id, bidAmount: newBidAmount },
                { withCredentials: true }
            )
            // Refresh details to reflect new bid
            await fetchDetail()
            setNewBidAmount('')
        } catch (err: any) {
            console.error(err)
            setSubmitError(err.response?.data?.message || 'Failed to submit bid. It might be too low or the bid may have ended.')
        } finally {
            setSubmitting(false)
        }
    }
  
    if (loading) return <div className="text-center p-10">Loading details…</div>
    if (error) return <div className="p-6 text-center text-red-600">Error: {error}</div>
    if (!bid) return <div className="text-center p-10">No bid found.</div>

    const getStatusBadge = (status: BiddingDetail['status']) => {
        const styles = {
          pending: 'bg-yellow-100 text-yellow-800',
          accepted: 'bg-green-100 text-green-800',
          rejected: 'bg-red-100 text-red-800',
        };
        return <span className={`px-3 py-1 text-sm font-medium capitalize rounded-full ${styles[status]}`}>{status}</span>;
    };
      

    return (
        <div className="bg-gray-50 min-h-screen">
          <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-6">
              <Link to="/dashboard" className="text-sm font-semibold text-blue-600 hover:underline flex items-center">
                 {/* Back arrow SVG */}
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                Back to Dashboard
              </Link>
            </div>
    
            <header className="mb-8 bg-white p-6 rounded-lg shadow-md">
                <div className="flex flex-col md:flex-row justify-between md:items-center">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Bid Details</h1>
                        <p className="mt-1 text-gray-500">Review all information for bid #{bid._id}</p>
                    </div>
                    <div className="mt-4 md:mt-0">
                    {getStatusBadge(bid.status)}
                    </div>
                </div>
            </header>
            
            <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column for Main Details */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Basic Info */}
                    <InfoCard title="General Information" icon={ <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> }>
                        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                            <DetailItem label="User" value={`${bid.userId.firstName} ${bid.userId.lastName} (${bid.userId.email})`} />
                            <DetailItem label="Bid Type" value={<span className="capitalize">{bid.bidType}</span>} />
                            <DetailItem label="Created At" value={new Date(bid.createdAt).toLocaleString()} />
                            <DetailItem label="Bid Ends" value={<span className="font-semibold text-red-600">{new Date(bid.bidEndTime).toLocaleString()}</span>} />
                        </dl>
                    </InfoCard>

                    {/* Dimensions & Route */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <InfoCard title="Shipment Details" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}>
                            <dl className="space-y-4">
                                <DetailItem label="Package Dimensions" value={`${bid.length} x ${bid.width} x ${bid.height} cm`} />
                                <DetailItem label="Weight & Quantity" value={`${bid.weightOfBox} kg (${bid.noofboxes} boxes)`} />
                            </dl>
                        </InfoCard>
                        <InfoCard title="Route & Pickup" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V7.618a1 1 0 01.553-.894L9 4m0 16v- механическиm 11 2.236A1 1 0 0121 7.618v8.764a1 1 0 01-.553.894L15 20m-6-4v-7m6 7V9" /></svg>}>
                            <dl className="space-y-4">
                                <DetailItem label="Route" value={`${bid.origin} → ${bid.destination}`} />
                                <DetailItem label="Pickup Schedule" value={`${new Date(bid.pickupDate).toLocaleDateString()} at ${bid.pickupTime}`} />
                            </dl>
                        </InfoCard>
                    </div>

                    {/* All Bids Placed */}
                    <InfoCard title="Bidding History" icon={ <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H9a2 2 0 00-2 2v2m4 6h.01M12 12h.01M12 18h.01M12 6h.01M7 12h.01M17 12h.01M7 18h.01M17 18h.01M7 6h.01" /></svg>}>
                        {bid.bids.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                <th scope="col" className="px-4 py-3">Transporter</th>
                                <th scope="col" className="px-4 py-3">Amount</th>
                                <th scope="col" className="px-4 py-3">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bid.bids.sort((a,b) => new Date(b.bidTime).getTime() - new Date(a.bidTime).getTime())
                                    .map((entry, index) => (
                                    <tr key={index} className="bg-white border-b hover:bg-gray-50">
                                        <th scope="row" className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{entry.transporter.companyName}</th>
                                        <td className="px-4 py-3 font-bold text-gray-800">₹{entry.amount.toLocaleString()}</td>
                                        <td className="px-4 py-3">{new Date(entry.bidTime).toLocaleString()}</td>
                                    </tr>
                                    ))}
                            </tbody>
                            </table>
                        </div>
                        ) : (
                        <p className="text-center py-4 text-gray-500 italic">No bids have been placed yet.</p>
                        )}
                    </InfoCard>
                </div>
                 
                 {/* Right Column for Actions & Secondary Info */}
                <div className="lg:col-span-1 space-y-8">
                     {/* Place a Bid */}
                     <InfoCard title="Place Your Bid" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 11V3m0 8h8M11 11H3m8 8v-8m0 0h8m-8 0H3" /></svg>}>
                            <form onSubmit={handleBidSubmit}>
                                <div className="space-y-4">
                                <div>
                                    <label htmlFor="bidAmount" className="block text-sm font-medium text-gray-700">Starting Bid Amount</label>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">₹{bid.bidAmount.toLocaleString()}</p>
                                    {typeof bid.transporterRating === 'number' && (
                                    <p className="text-sm text-gray-500 mt-1">Minimum required rating: {bid.transporterRating} ★</p>
                                    )}
                                </div>
                                <hr />
                                <div>
                                    <label htmlFor="newBidAmount" className="block text-sm font-medium text-gray-700 mb-1">
                                    Your Bid Amount (₹)
                                    </label>
                                    <input
                                        type="number"
                                        id="newBidAmount"
                                        value={newBidAmount}
                                        onChange={(e) => setNewBidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="e.g., 4800"
                                        required
                                        min={0}
                                    />
                                </div>
                                
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-300 transition-colors"
                                >
                                    {submitting ? 'Submitting...' : 'Place Bid'}
                                </button>
                                
                                {submitError && <p className="text-sm text-red-600 mt-2">{submitError}</p>}
                                </div>
                            </form>
                    </InfoCard>

                    {/* Invited Transporters */}
                    {(bid.bidType === 'limited' || bid.bidType === 'semi-limited') && (
                        <InfoCard title="Invited Transporters" icon={ <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197m0 0A5.975 5.975 0 006 15a5.975 5.975 0 00-3-1.197z" /></svg>}>
                        {bid.bidders.length > 0 ? (
                            <ul className="space-y-3">
                            {bid.bidders.map((t) => (
                                <li key={t._id} className="flex justify-between items-center text-sm">
                                <span className="text-gray-800 font-medium">{t.companyName}</span>
                                <span className="text-gray-500">{t.rating} ★</span>
                                </li>
                            ))}
                            </ul>
                        ) : (
                            <p className="text-center py-4 text-gray-500 italic">This bid is open to all transporters.</p>
                        )}
                        </InfoCard>
                    )}
                </div>
            </main>
          </div>
        </div>
      );
    }
    
    export default BiddingDetails;