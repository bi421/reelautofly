'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type User = { id: string; email: string; name: string }

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : { user: null }))
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false))
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center">Loading…</main>

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">ReelAutoFly</p>
          <h1 className="mt-2 text-4xl font-bold">Turn products into publish-ready Reels.</h1>
          <p className="mt-3 max-w-2xl text-gray-600">Secure sessions, encrypted Meta credentials, guarded publishing, and durable background jobs.</p>
        </div>
        {user ? <button onClick={logout} className="rounded-md border px-4 py-2 text-sm">Sign out</button> : <Link href="/auth" className="rounded-md bg-black px-4 py-2 text-sm text-white">Get started</Link>}
      </div>
      {user && (
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <Link href="/connect" className="rounded-xl border p-6 hover:bg-gray-50"><strong>Connect Meta</strong><p className="mt-2 text-sm text-gray-500">Manage publishing accounts.</p></Link>
          <Link href="/upload" className="rounded-xl border p-6 hover:bg-gray-50"><strong>Create Reel</strong><p className="mt-2 text-sm text-gray-500">Upload a product asset.</p></Link>
          <Link href="/jobs" className="rounded-xl border p-6 hover:bg-gray-50"><strong>Jobs</strong><p className="mt-2 text-sm text-gray-500">Monitor render and publish state.</p></Link>
        </div>
      )}
    </main>
  )
}
