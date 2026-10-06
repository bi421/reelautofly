'use client'

import { useEffect, useState } from 'react'

type Subscription = {
  plan: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
} | null

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/billing/subscription', { credentials: 'include' })
      .then((r) => r.json())
      .then(setSubscription)
      .finally(() => setLoading(false))
  }, [])

  async function checkout(plan: 'PRO' | 'TEAM' | 'ENTERPRISE') {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    const data = await response.json()
    if (data.url) window.location.assign(data.url)
    else alert(data.message || 'Unable to start checkout')
  }

  async function portal() {
    const response = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' })
    const data = await response.json()
    if (data.url) window.location.assign(data.url)
    else alert(data.message || 'Unable to open billing portal')
  }

  if (loading) return <main className="p-8">Loading…</main>

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold">Billing</h1>
      <p className="mt-2 text-sm text-gray-500">Choose a plan. Stripe handles payment details; ReelAutoFly stores subscription state.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {(['PRO', 'TEAM', 'ENTERPRISE'] as const).map((plan) => (
          <button key={plan} onClick={() => checkout(plan)} className="rounded-xl border p-6 text-left hover:bg-gray-50">
            <strong>{plan}</strong>
            <p className="mt-2 text-sm text-gray-500">Start Stripe Checkout.</p>
          </button>
        ))}
      </div>
      {subscription && (
        <div className="mt-8 rounded-xl border p-6">
          <p>Plan: <strong>{subscription.plan}</strong></p>
          <p>Status: {subscription.status}</p>
          <button onClick={portal} className="mt-4 rounded-md bg-black px-4 py-2 text-sm text-white">Manage billing</button>
        </div>
      )}
    </main>
  )
}
