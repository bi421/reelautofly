'use client'

import { useEffect, useState } from 'react'

type Job = {
  id: string
  status: string
  attempts: number
  errorMessage: string | null
  scheduledAt: string | null
  guardResult: any
  publishResult: any
  account?: {
    provider: string
    providerUserId: string
  }
  createdAt: string
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs', {
        headers: { 'x-user-id': 'demo-user' },
      })
      const data = await res.json()
      setJobs(data)
    } catch (e) {
      console.error('Failed to fetch jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  const statusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return 'bg-green-100 text-green-700'
      case 'FAILED': return 'bg-red-100 text-red-700'
      case 'QUEUED': return 'bg-gray-100 text-gray-700'
      case 'GUARD_CHECK': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-blue-100 text-blue-700'
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Jobs</h1>
      <p className="mt-1 text-sm text-gray-500">Auto-refreshes every 5 seconds.</p>

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading...</p>
      ) : jobs.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No jobs yet. Upload a product to get started.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Account</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Guard Result</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Publish Result</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Scheduled At</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Attempts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-3 font-mono text-xs">{job.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${statusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {job.account ? `${job.account.provider} ${job.account.providerUserId}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {job.guardResult ? `${job.guardResult.failedGuards?.length ? `Failed: ${job.guardResult.failedGuards.join(', ')}` : 'Passed'}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {job.publishResult?.igMediaId ? `IG: ${job.publishResult.igMediaId}` : job.publishResult?.fbPostId ? `FB: ${job.publishResult.fbPostId}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{job.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
