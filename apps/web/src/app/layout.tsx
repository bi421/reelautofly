import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ReelAutoFly',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">
        <nav className="border-b bg-white">
          <div className="mx-auto max-w-5xl px-4 py-3 flex gap-6">
            <a href="/connect" className="text-sm font-medium text-gray-700 hover:text-black">Connect</a>
            <a href="/upload" className="text-sm font-medium text-gray-700 hover:text-black">Upload</a>
            <a href="/jobs" className="text-sm font-medium text-gray-700 hover:text-black">Jobs</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
