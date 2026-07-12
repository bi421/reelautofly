import { Controller, Post, Body, Req } from '@nestjs/common'
import { db } from '@reelautofly/db'
import { z } from 'zod'

const PresignSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
})

@Controller('upload')
export class UploadController {
  @Post('presign')
  async presign(@Req() req: any, @Body() body: unknown) {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      return { error: 'x-user-id header required' }
    }

    const parsed = PresignSchema.parse(body)
    const key = `users/${userId}/${Date.now()}-${parsed.fileName}`

    const endpoint = process.env.R2_ENDPOINT!
    const bucket = process.env.R2_BUCKET!
    const accessKey = process.env.R2_ACCESS_KEY_ID!
    const secretKey = process.env.R2_SECRET_ACCESS_KEY!

    const expiresIn = 3600
    const url = `${endpoint}/${bucket}/${key}`

    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': parsed.contentType,
      },
      key,
    }
  }
}
