// 密码哈希。
//
// 用 Node 内置的 crypto.scrypt，不用 bcrypt —— 后者是原生模块，
// 在 Windows 上安装要过 node-gyp/MSVC 编译，跟本项目「零原生依赖」的路线冲突。
// scrypt 本身是抗 GPU 暴力破解的强 KDF，足够胜任。
import crypto from 'node:crypto'

const KEY_LEN = 64
const SALT_LEN = 16

/** 产出 'salt:hash'（均为 hex）。两个值必须一起存进 users.password_hash。 */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex')
  const hash = crypto.scryptSync(plain, salt, KEY_LEN).toString('hex')
  return `${salt}:${hash}`
}

/**
 * 校验密码。
 * 用 timingSafeEqual 而不是 === ：字符串比较会在第一个不同字节处提前返回，
 * 攻击者能通过响应时间差逐字节猜出哈希值。
 */
export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false

  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false

  let actual
  try {
    actual = crypto.scryptSync(plain, salt, KEY_LEN).toString('hex')
  } catch {
    return false
  }

  const a = Buffer.from(actual, 'hex')
  const b = Buffer.from(expected, 'hex')
  // 长度不等时 timingSafeEqual 会抛错，先挡掉
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** 生成不透明会话 token（32 字节 → 64 字符 hex） */
export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}
