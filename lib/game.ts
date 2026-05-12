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
      // Tie — nobody eliminated
      eliminated = null
    }
  }
  return eliminated
}

/**
 * BUG FIX (Bug 5):
 * Original condition `spies.length >= civilians.length` caused the game to end
 * immediately in a 2-player game (1 spy + 1 civilian) even when no one was
 * eliminated — because 1 >= 1 is true.
 *
 * Per the game rules, the game should only end if:
 *   - All spies are voted out → civilians win
 *   - Spies OUTNUMBER the remaining civilians → spies win
 *     (strictly greater than, not equal — equal means the game continues)
 *
 * Using `spies.length > civilians.length` (strict greater-than) means that
 * with 1 spy and 1 civilian remaining the game continues to the next round,
 * which matches the stated mechanic: "game ends if all agents voted out."
 */
export function checkWinCondition(
  alivePlayers: Player[]
): 'civilians' | 'spies' | null {
  const spies = alivePlayers.filter(p => p.role === 'spy')
  const civilians = alivePlayers.filter(p => p.role === 'civilian')

  // All spies eliminated → civilians win
  if (spies.length === 0) return 'civilians'

  // Spies strictly outnumber remaining civilians → spies win
  if (spies.length > civilians.length) return 'spies'

  return null
}