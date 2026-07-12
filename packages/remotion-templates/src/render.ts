import { renderMedia } from '@remotion/renderer'
import { bundle } from '@remotion/bundler'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { promises as fs } from 'fs'
import path from 'path'
import { ProductShowcase } from './templates/ProductShowcase'
import { BeforeAfter } from './templates/BeforeAfter'
import { UGCStyle } from './templates/UGCStyle'

const TEMPLATES: Record<string, React.ComponentType<any>> = {
  ProductShowcase,
  BeforeAfter,
  UGCStyle,
}

const OUTPUT_DIR = '/tmp/reelautofly'

export async function renderReel(
  templateName: string,
  props: any,
  jobId: string,
): Promise<{ outputPath: string; metadata: { duration: number; width: number; height: number; sizeMB: number } }> {
  const TemplateComponent = TEMPLATES[templateName]
  if (!TemplateComponent) {
    throw new Error(`Template ${templateName} not found`)
  }

  const width: number = 1080
  const height: number = 1920
  const duration: number = 7

  if (width !== 1080 || height !== 1920) {
    throw new Error(`Invalid spec: expected 1080x1920, got ${width}x${height}`)
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`)

  const bundled = await bundle(path.join(__dirname, 'render-entry.tsx'))

  const durationInFrames = duration * 30

  await renderMedia({
    serveUrl: bundled,
    outputPath,
    composition: {
      id: templateName,
      component: TemplateComponent as any,
      durationInFrames,
      fps: 30,
      width,
      height,
      props,
    } as any,
    codec: 'h264',
    audioCodec: 'aac',
    onProgress: (progress: number) => {
      console.log(`Render progress: ${(progress * 100).toFixed(1)}%`)
    },
  } as any)

  const stats = await fs.stat(outputPath)
  const sizeMB = Number((stats.size / (1024 * 1024)).toFixed(2))

  if (sizeMB >= 100) {
    throw new Error(`Rendered video exceeds 100MB limit: ${sizeMB}MB`)
  }

  const r2Endpoint = process.env.R2_ENDPOINT!
  const r2Bucket = process.env.R2_BUCKET!
  const r2Key = `reels/${jobId}.mp4`

  const s3 = new S3Client({
    endpoint: r2Endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })

  const fileBuffer = await fs.readFile(outputPath)
  await s3.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: 'video/mp4',
    }),
  )

  const publicUrl = `${r2Endpoint}/${r2Bucket}/${r2Key}`

  return {
    outputPath,
    metadata: {
      duration,
      width,
      height,
      sizeMB,
    },
  }
}
