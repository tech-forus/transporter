// src/pages/Dashboard.tsx

import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

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

const Dashboard: React.FC = () => {
  const { user, isAuthenticated } = useAuth()
  const [openBids, setOpenBids] = useState<Bid[]>([])
  const [limitedBids, setLimitedBids] = useState<Bid[]>([])
  const [semiLimitedBids, setSemiLimitedBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        'https://backend-bcxr.onrender.com/api/bidding/getbids',
        { tid: user._id },
        { headers: { 'Content-Type': 'application/json' } }
      )

      const { openBids, limitedBids, semiLimitedBids } = res.data.data
      setOpenBids(openBids)
      setLimitedBids(limitedBids)
      setSemiLimitedBids(semiLimitedBids)
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

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="p-8 text-center bg-white rounded-lg shadow-md">
          <p className="text-lg font-semibold text-red-600">
            Please log in to view bids.
          </p>
          <Link to="/login">
            <button className="mt-4 px-6 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Go to Login
            </button>
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-gray-600">Loading bids…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 text-center text-red-800 bg-red-100 rounded-lg max-w-md mx-auto">
          <p>{error}</p>
          <button
            onClick={fetchBids}
            className="mt-4 px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const renderList = (bids: Bid[]) =>
    bids.length > 0 ? (
      <div className="space-y-4">
        {bids.map((b) => (
          <div
            key={b._id}
            className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-lg transition-all duration-300"
          >
            <div className="flex-grow mb-4 md:mb-0">
              <div className="flex items-center mb-2">
                <span className="font-bold text-lg text-gray-800 mr-3">
                  {b.userId.companyName}
                </span>
                <span className="text-sm text-gray-500">
                  ({b.userId.firstName} {b.userId.lastName})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm text-gray-600">
                <p>
                  <span className="font-semibold">Amount:</span> ₹{b.bidAmount.toLocaleString()}
                </p>
                <p>
                  <span className="font-semibold">Pickup:</span>{' '}
                  {new Date(b.pickupDate).toLocaleDateString()} at {b.pickupTime}
                </p>
                <p>
                  <span className="font-semibold">Ends:</span>{' '}
                  {new Date(b.bidEndTime).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex-shrink-0">
              <Link to={`/bidding/details/${b._id}`}>
                <button className="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
                  View Details
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-center py-10 px-4 border-2 border-dashed border-gray-300 rounded-lg">
        <p className="text-gray-500 italic">No bids found in this category.</p>
      </div>
    );

  const Section: React.FC<{ title: string; bids: Bid[]; }> = ({ title, bids }) => (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
      </div>
      {renderList(bids)}
    </section>
  );

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">
            Available Bids
          </h1>
          <button
            onClick={fetchBids}
            disabled={loading}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
          >
            {/* SVG for refresh icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm-1 9a1 1 0 011-1h5a1 1 0 110 2H5a1 1 0 01-1-1zm11.601-2.566a1 1 0 111.885-.666A7.002 7.002 0 018.399 17.899V15.5a1 1 0 112 0v3a1 1 0 01-1 1h-3a1 1 0 110-2h2.001a5.002 5.002 0 00-3.3-8.899z" clipRule="evenodd" />
            </svg>
            Refresh
          </button>
        </header>
        <main>
          <Section title="Open Bids" bids={openBids} />
          <Section title="Limited Bids" bids={limitedBids} />
          <Section title="Semi‑Limited Bids" bids={semiLimitedBids} />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;