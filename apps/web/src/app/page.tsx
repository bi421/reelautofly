export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <h1 className="text-6xl font-bold tracking-tight">ReelAutoFly</h1>
      <div className="mt-8 flex gap-4">
        <a href="/connect" className="rounded-md bg-white px-6 py-3 text-sm font-medium text-black hover:bg-gray-200">Connect Account</a>
        <a href="/upload" className="rounded-md bg-white px-6 py-3 text-sm font-medium text-black hover:bg-gray-200">Upload Product</a>
        <a href="/jobs" className="rounded-md bg-white px-6 py-3 text-sm font-medium text-black hover:bg-gray-200">Jobs</a>
      </div>
    </main>
  )
}
