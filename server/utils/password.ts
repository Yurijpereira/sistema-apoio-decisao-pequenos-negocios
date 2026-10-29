import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { validLoginPassword, validNewPassword } from '../../shared/utils/password.ts'

const prefix = 'scrypt:131072:8:1'
const pattern = /^scrypt:131072:8:1:([a-f0-9]{32}):([a-f0-9]{128})$/
export function validPassword(value: unknown): value is string {
  return validNewPassword(value)
}
export function validPasswordHash(value: unknown): value is string {
  return typeof value === 'string' && pattern.test(value)
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(salt, 'hex'),
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}
export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password)) {
    throw new RangeError('Use uma senha de 15 a 128 caracteres, sem controles.')
  }
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt)
  return `${prefix}:${salt}:${key.toString('hex')}`
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = pattern.exec(hash)
  if (!parts?.[1] || !parts[2] || !validLoginPassword(password)) {
    return false
  }
  return timingSafeEqual(await derive(password, parts[1]), Buffer.from(parts[2], 'hex'))
}
/** SHA-256 somente para tokens aleatórios de 256 bits e fingerprint, nunca para senhas. */
export function tokenDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
export function equalDigest(left: string, right: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
  )
}
