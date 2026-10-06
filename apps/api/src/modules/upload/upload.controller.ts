import { Controller, Post, Body, Req } from '@nestjs/common'
import { z } from 'zod'

const PresignSchema = z.object({
  fileName: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._-]+$/),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

@Controller('upload')
export class UploadController {
  @Post('presign')
  async presign(@Req() req: any, @Body() body: unknown) {
    const parsed = PresignSchema.parse(body)
    const endpoint = process.env.R2_PUBLIC_BASE_URL
    if (!endpoint) throw new Error('R2_PUBLIC_BASE_URL is not configured')
    const key = `users/${req.userId}/${Date.now()}-${parsed.fileName}`
    return {
      url: `${endpoint.replace(/\/$/, '')}/${key}`,
      method: 'PUT',
      headers: { 'Content-Type': parsed.contentType },
      key,
      expiresIn: 900,
    }
  }
}
