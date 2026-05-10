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

export function getOrCreateDeviceToken(): string {
  if (typeof window === 'undefined') return ''
  const key = 'spy_device_token'
  let token = localStorage.getItem(key)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(key, token)
  }
  return token
}