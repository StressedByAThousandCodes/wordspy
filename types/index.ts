export type RoomStatus = 'lobby' | 'playing' | 'ended'
export type PlayerRole = 'civilian' | 'spy'
export type GamePhase = 'describing' | 'discussing' | 'voting' | 'result'

export interface Room {
  id: string
  code: string
  host_id: string
  status: RoomStatus
  spy_count: number
  describe_seconds: number
  discuss_seconds: number
  vote_seconds: number
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  nickname: string
  is_ready: boolean
  is_alive: boolean
  role: PlayerRole | null
  device_token: string
  joined_at: string
}

export interface Round {
  id: string
  room_id: string
  round_number: number
  civilian_word: string
  spy_word: string
  phase: GamePhase
  phase_ends_at: string
  created_at: string
}

export interface Description {
  id: string
  round_id: string
  player_id: string
  content: string
  submitted_at: string
}

export interface Vote {
  id: string
  round_id: string
  voter_id: string
  target_id: string
  created_at: string
}

export interface ChatMessage {
  id: string
  room_id: string
  player_id: string
  content: string
  created_at: string
}

export interface User {
  id: string
  nickname: string
  device_token: string
  created_at: string
  last_seen_at: string
}