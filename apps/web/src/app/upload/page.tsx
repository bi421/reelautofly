'use client'

import { useState, useCallback } from 'react'

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [product, setProduct] = useState<any>(null)
  const [dragOver, setDragOver] = useState(false)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    setFiles((prev) => [...prev, ...dropped].slice(0, 5))
  }, [])

  const uploadFiles = async () => {
    if (files.length === 0) return
    setUploading(true)
    setStatus(null)
    setProduct(null)

    try {
      const imageUrls: string[] = []
      for (const file of files) {
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': 'demo-user',
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
          }),
        })
        const presign = await presignRes.json()

        await fetch(presign.url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
          },
          body: file,
        })

        imageUrls.push(presign.key)
      }

      const productRes = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({ originalImages: imageUrls }),
      })
      const data = await productRes.json()
      setProduct(data)
      setStatus('Product uploaded and job created')
      setFiles([])
    } catch (e) {
      setStatus('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Upload Product</h1>
      <p className="mt-1 text-sm text-gray-500">Upload 1-5 product images. A Reel job will be created automatically.</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mt-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 ${dragOver ? 'border-black bg-gray-50' : 'border-gray-300'}`}
      >
        <p className="text-sm text-gray-600">Drag and drop images here, or click to select</p>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const selected = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/')).slice(0, 5)
            setFiles((prev) => [...prev, ...selected].slice(0, 5))
          }}
          className="mt-3 text-sm"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">Selected files ({files.length}/5)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {files.map((f, i) => (
              <li key={i}>{f.name}</li>
            ))}
          </ul>
          <button
            onClick={uploadFiles}
            disabled={uploading}
            className="mt-3 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload and Create Job'}
          </button>
        </div>
      )}

      {status && (
        <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          {status}
          {product && (
            <div className="mt-1 text-xs text-gray-600">
              Product created with {product.originalImages?.length || 0} images. Job status: {product.job?.status}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
