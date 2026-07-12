export interface AccountResponse {
  id: string
  provider: string
  providerUserId: string
  pageId: string | null
  maskedToken: string
  tokenExpiresAt: Date | null
  status: string
  lastRefreshedAt: Date | null
  createdAt: Date
}

export interface ValidateTokenResponse {
  valid: boolean
  reason?: string
}
