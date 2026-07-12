'use client'

import { useState } from 'react'

type Provider = 'INSTAGRAM' | 'FACEBOOK'

export default function ConnectPage() {
  const [provider, setProvider] = useState<Provider>('INSTAGRAM')
  const [providerUserId, setProviderUserId] = useState('')
  const [pageId, setPageId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [maskedToken, setMaskedToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const testConnection = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/accounts/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({
          provider,
          providerUserId,
          pageId: provider === 'FACEBOOK' ? pageId : undefined,
          accessToken,
        }),
      })
      const data = await res.json()
      setStatus(data.message || data.error)
    } catch (e) {
      setStatus('Test failed')
    } finally {
      setLoading(false)
    }
  }

  const saveAccount = async () => {
    setLoading(true)
    setStatus(null)
    setMaskedToken(null)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({
          provider,
          providerUserId,
          pageId: provider === 'FACEBOOK' ? pageId : undefined,
          accessToken,
        }),
      })
      const data = await res.json()
      if (data.maskedToken) {
        setMaskedToken(data.maskedToken)
        setStatus('Connected successfully')
        setAccessToken('')
      } else if (data.error) {
        setStatus(data.error)
      }
    } catch (e) {
      setStatus('Save failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Connect Account</h1>
      <p className="mt-1 text-sm text-gray-500">Bring your own Meta API access token.</p>

      <div className="mt-6 flex gap-2 border-b">
        <button
          onClick={() => setProvider('INSTAGRAM')}
          className={`px-4 py-2 text-sm font-medium ${provider === 'INSTAGRAM' ? 'border-b-2 border-black' : 'text-gray-500'}`}
        >
          Instagram Business
        </button>
        <button
          onClick={() => setProvider('FACEBOOK')}
          className={`px-4 py-2 text-sm font-medium ${provider === 'FACEBOOK' ? 'border-b-2 border-black' : 'text-gray-500'}`}
        >
          Facebook Page
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Provider User ID</label>
          <input
            value={providerUserId}
            onChange={(e) => setProviderUserId(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder={provider === 'INSTAGRAM' ? 'IG User ID' : 'Page ID'}
          />
        </div>

        {provider === 'FACEBOOK' && (
          <div>
            <label className="block text-sm font-medium">Page ID</label>
            <input
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Facebook Page ID"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium">Access Token</label>
          <textarea
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            rows={4}
            placeholder="Long-lived User Access Token"
          />
          <p className="mt-1 text-xs text-gray-500">Token is encrypted with AES-256-GCM before storage.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={testConnection}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Test Connection
          </button>
          <button
            onClick={saveAccount}
            disabled={loading}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>

        {status && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
            {status}
            {maskedToken && (
              <div className="mt-1 text-xs text-gray-600">Masked token: {maskedToken}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
