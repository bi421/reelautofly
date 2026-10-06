import { Controller, Post, Body, Req } from '@nestjs/common'
import { z } from 'zod'
import { createHmac, createHash } from 'node:crypto'

const PresignSchema = z.object({
  fileName: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._-]+$/),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function presignPut(endpoint: string, bucket: string, key: string, contentType: string, accessKey: string, secretKey: string, expiresIn: number) {
  const url = new URL(`${endpoint.replace(/\/$/, '')}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`)
  const host = url.host
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const credential = `${accessKey}/${credentialScope}`
  const signedHeaders = 'content-type;host'
  const canonicalUri = url.pathname.split('/').map((segment) => segment ? encodeURIComponent(decodeURIComponent(segment)) : '').join('/')
  const canonicalQuery = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&')
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
  const kDate = hmac(`AWS4${secretKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`
  return url.toString()
}

@Controller('upload')
export class UploadController {
  @Post('presign')
  async presign(@Req() req: any, @Body() body: unknown) {
    const parsed = PresignSchema.parse(body)
    const endpoint = process.env.R2_ENDPOINT
    const bucket = process.env.R2_BUCKET
    const accessKey = process.env.R2_ACCESS_KEY_ID
    const secretKey = process.env.R2_SECRET_ACCESS_KEY
    if (!endpoint || !bucket || !accessKey || !secretKey) {
      throw new Error('R2 storage is not configured')
    }

    const key = `users/${req.userId}/${Date.now()}-${parsed.fileName}`
    const expiresIn = 900
    const url = presignPut(endpoint, bucket, key, parsed.contentType, accessKey, secretKey, expiresIn)

    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': parsed.contentType },
      key,
      expiresIn,
    }
  }
}
