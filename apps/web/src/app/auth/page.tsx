'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mode === 'signup' ? { email, password, name } : { email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Authentication failed')
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-bold">ReelAutoFly</h1>
      <p className="mt-2 text-sm text-gray-500">{mode === 'signup' ? 'Create your account.' : 'Sign in to your account.'}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {mode === 'signup' && <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full rounded-md border px-3 py-2" />}
        <input required type="email" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-md border px-3 py-2" />
        <input required type="password" minLength={12} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (12+ characters)" className="w-full rounded-md border px-3 py-2" />
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="w-full rounded-md bg-black px-4 py-3 font-medium text-white disabled:opacity-50">
          {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <button onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')} className="mt-4 text-sm underline">
        {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
      </button>
    </main>
  )
}
