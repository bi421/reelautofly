// apps/publisher/src/meta-graph.client.ts

export type MetaErrorCategory =
  | 'RATE_LIMIT'
  | 'TOKEN_INVALID'
  | 'POLICY_VIOLATION'
  | 'TRANSIENT'
  | 'UNKNOWN'

// Meta-ийн нийтлэг алдааны кодууд. Эдгээрийг Meta хугацаа өнгөрөхөд өөрчилж болох тул
// таарахгүй тохиолдол бүрийг UNKNOWN болгож, log-оор гараар шалгуулна.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613])
const TOKEN_INVALID_CODES = new Set([190])
const POLICY_VIOLATION_CODES = new Set([368, 200, 294, 10])

export class MetaGraphError extends Error {
  constructor(
    public statusCode: number,
    public graphMessage: string,
    public graphType: string,
    public graphCode: number,
    public fbtraceId?: string,
    public graphSubcode?: number,
  ) {
    super(graphMessage)
    this.name = 'MetaGraphError'
  }

  categorize(): MetaErrorCategory {
    if (this.statusCode === 429 || RATE_LIMIT_CODES.has(this.graphCode)) {
      return 'RATE_LIMIT'
    }
    if (this.graphType === 'OAuthException' && TOKEN_INVALID_CODES.has(this.graphCode)) {
      return 'TOKEN_INVALID'
    }
    if (POLICY_VIOLATION_CODES.has(this.graphCode)) {
      return 'POLICY_VIOLATION'
    }
    if (this.statusCode >= 500 && this.statusCode < 600) {
      return 'TRANSIENT'
    }
    return 'UNKNOWN'
  }
}

export type MetaGraphClientOptions = {
  apiVersion?: string
  accessToken?: string
}

export class MetaGraphClient {
  private readonly baseUrl: string
  private readonly defaultAccessToken?: string

  constructor(options: MetaGraphClientOptions = {}) {
    const version = options.apiVersion || process.env.META_GRAPH_API_VERSION || 'v20.0'
    this.baseUrl = `https://graph.facebook.com/${version}`
    this.defaultAccessToken = options.accessToken
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    accessToken?: string,
  ): Promise<T> {
    const token = accessToken || this.defaultAccessToken
    const isGet = !options.method || options.method === 'GET'

    let url = `${this.baseUrl}${path}`
    const body = new URLSearchParams()

    if (isGet) {
      const separator = path.includes('?') ? '&' : '?'
      url = `${url}${separator}access_token=${encodeURIComponent(token!)}`
    } else {
      if (options.body) {
        const params = new URLSearchParams(options.body as string)
        params.forEach((value, key) => {
          body.set(key, value)
        })
      }
      body.set('access_token', token!)
    }

    const response = await fetch(url, {
      ...options,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: isGet ? undefined : body.toString(),
    })

    const text = await response.text()

    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (!response.ok || data.error) {
      const err = data.error || {}
      throw new MetaGraphError(
        response.status,
        err.message || 'Unknown Meta Graph API error',
        err.type || 'unknown',
        err.code || 0,
        err.fbtrace_id,
        err.error_subcode,
      )
    }

    return data as T
  }

  createIgContainer(
    igUserId: string,
    videoUrl: string,
    caption: string,
    accessToken: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
    })

    return this.request<{ id: string }>(`/${encodeURIComponent(igUserId)}/media`, {
      method: 'POST',
      body: params.toString(),
    }, accessToken)
  }

  getContainerStatus(
    containerId: string,
    accessToken: string,
  ): Promise<{ status_code: string }> {
    return this.request<{ status_code: string }>(`/${encodeURIComponent(containerId)}?fields=status_code`, {}, accessToken)
  }

  publishContainer(
    igUserId: string,
    containerId: string,
    accessToken: string,
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      creation_id: containerId,
    })

    return this.request<{ id: string }>(`/${encodeURIComponent(igUserId)}/media_publish`, {
      method: 'POST',
      body: params.toString(),
    }, accessToken)
  }

  createFbReelContainer(
    pageId: string,
    videoUrl: string,
    description: string,
    accessToken: string,
  ): Promise<{ video_id: string }> {
    const params = new URLSearchParams({
      upload_phase: 'START',
      video_file_url: videoUrl,
      description,
    })

    return this.request<{ video_id: string }>(`/${encodeURIComponent(pageId)}/video_reels`, {
      method: 'POST',
      body: params.toString(),
    }, accessToken)
  }
}