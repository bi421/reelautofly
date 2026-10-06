import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { db } from '@reelautofly/db'

const SESSION_DAYS = 30

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error)
      else resolve(derived as Buffer)
    })
  })
}

function hashSession(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [, n, r, p, saltText, hashText] = encoded.split('$')
  if (!n || !r || !p || !saltText || !hashText) return false
  const salt = Buffer.from(saltText, 'base64url')
  const expected = Buffer.from(hashText, 'base64url')
  const derived = await scryptAsync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) })
  return timingSafeEqual(expected, derived)
}

@Injectable()
export class AuthService {
  async signup(email: string, password: string, name: string) {
    const normalizedEmail = email.trim().toLowerCase()
    if (password.length < 12) throw new ConflictException('Password must be at least 12 characters')
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) throw new ConflictException('Account already exists')

    const user = await db.user.create({
      data: { email: normalizedEmail, name: name.trim(), passwordHash: await hashPassword(password) },
      select: { id: true, email: true, name: true, createdAt: true },
    })
    return { user, token: await this.createSession(user.id) }
  }

  async login(email: string, password: string) {
    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password')
    }
    return {
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
      token: await this.createSession(user.id),
    }
  }

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
    await db.session.create({ data: { userId, tokenHash: hashSession(token), expiresAt } })
    return token
  }

  async resolveSession(token: string | undefined) {
    if (!token) return null
    const session = await db.session.findUnique({
      where: { tokenHash: hashSession(token) },
      select: { id: true, userId: true, expiresAt: true },
    })
    if (!session || session.expiresAt <= new Date()) {
      if (session) await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
      return null
    }
    return session
  }

  async revokeSession(token: string | undefined) {
    if (!token) return
    await db.session.deleteMany({ where: { tokenHash: hashSession(token) } })
  }
}
