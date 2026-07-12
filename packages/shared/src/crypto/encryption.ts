import crypto from 'crypto'

export function validateKey(key: string): void {
  const buf = Buffer.from(key, 'hex')
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY_32_BYTES must be 32 bytes hex-encoded')
  }
}

export function encrypt(plainText: string, key: string): { iv: string; authTag: string; encryptedData: string } {
  validateKey(key)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encryptedData: encrypted.toString('hex'),
  }
}

export function decrypt(iv: string, authTag: string, encryptedData: string, key: string): string {
  validateKey(key)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(authTag, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedData, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}

export function maskToken(token: string): string {
  if (!token || token.length <= 6) return '***'
  return `***${token.slice(-6)}`
}
