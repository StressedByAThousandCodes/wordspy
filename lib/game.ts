import { Player, Vote } from '@/types'

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export function assignRoles(
  players: Player[],
  spyCount: number
): Map<string, 'civilian' | 'spy'> {
  const shuffled = [...players].sort(() => Math.random() - 0.5)
  const roles = new Map<string, 'civilian' | 'spy'>()
  shuffled.forEach((p, i) => {
    roles.set(p.id, i < spyCount ? 'spy' : 'civilian')
  })
  return roles
}

export function getPhaseEndsAt(durationSeconds: number): string {
  return new Date(Date.now() + durationSeconds * 1000).toISOString()
}

export function tallyVotes(votes: Vote[]): string | null {
  const counts = new Map<string, number>()
  for (const vote of votes) {
    counts.set(vote.target_id, (counts.get(vote.target_id) ?? 0) + 1)
  }
  let maxVotes = 0
  let eliminated: string | null = null
  for (const [playerId, count] of counts) {
    if (count > maxVotes) {
      maxVotes = count
      eliminated = playerId
    } else if (count === maxVotes) {
      eliminated = null
    }
  }
  return eliminated
}

export function checkWinCondition(
  alivePlayers: Player[]
): 'civilians' | 'spies' | null {
  const spies = alivePlayers.filter(p => p.role === 'spy')
  const civilians = alivePlayers.filter(p => p.role === 'civilian')
  if (spies.length === 0) return 'civilians'
  if (spies.length >= civilians.length) return 'spies'
  return null
}