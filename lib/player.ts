// Deterministic emoji avatar based on player ID or nickname
const EMOJIS = [
  '🦊','🐺','🦁','🐯','🐻','🦝','🐸','🦄','🐙','🦋',
  '🐧','🦅','🐬','🦊','🐲','🦩','🦀','🐝','🦉','🐨',
  '🦈','🐞','🦜','🐢','🦒','🦏','🐡','🦦','🦥','🐿️',
]

const COLORS = [
  { bg: 'from-violet-500 to-purple-600', ring: 'ring-violet-400' },
  { bg: 'from-rose-500 to-pink-600',     ring: 'ring-rose-400' },
  { bg: 'from-amber-500 to-orange-600',  ring: 'ring-amber-400' },
  { bg: 'from-emerald-500 to-teal-600',  ring: 'ring-emerald-400' },
  { bg: 'from-sky-500 to-blue-600',      ring: 'ring-sky-400' },
  { bg: 'from-fuchsia-500 to-pink-600',  ring: 'ring-fuchsia-400' },
  { bg: 'from-lime-500 to-green-600',    ring: 'ring-lime-400' },
  { bg: 'from-cyan-500 to-teal-600',     ring: 'ring-cyan-400' },
]

function hashStr(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getPlayerEmoji(id: string): string {
  return EMOJIS[hashStr(id) % EMOJIS.length]
}

export function getPlayerColor(id: string) {
  return COLORS[hashStr(id) % COLORS.length]
}

function generateUUID(): string {
  // crypto.randomUUID() is not available on Safari < 15.4
  // Fall back to a manual implementation using crypto.getRandomValues()
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback using getRandomValues (supported on all modern browsers including old Safari)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant RFC4122
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-')
  }

  // Last resort — Math.random based (not cryptographically secure but functional)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export function getOrCreateDeviceToken(): string {
  if (typeof window === 'undefined') return ''
  const key = 'spy_device_token'
  let token = localStorage.getItem(key)
  if (!token) {
    token = generateUUID()
    localStorage.setItem(key, token)
  }
  return token
}