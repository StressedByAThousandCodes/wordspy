'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerEmoji, getPlayerColor } from '@/lib/player'
import { Card, Badge, Spinner } from '@/components/ui'
import { ThemeToggle } from '@/components/theme'
import type { Round, Player, Description, Vote, Room } from '@/types'

export default function GamePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const [room, setRoom] = useState<Room | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [descriptions, setDescriptions] = useState<Description[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myDescription, setMyDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [voted, setVoted] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showDescribeModal, setShowDescribeModal] = useState(false)
  const roundRef = useRef<Round | null>(null)
  const hasAdvanced = useRef(false)
  const lastPhase = useRef<string | null>(null)

  const myPlayer = players.find(p => p.id === myPlayerId)
  const alivePlayers = players.filter(p => p.is_alive)
  const isAlive = myPlayer?.is_alive ?? false

  const eliminatedPlayerId = votes.length > 0
    ? (() => {
        const counts = new Map<string, number>()
        for (const v of votes) counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1)
        let max = 0, id: string | null = null
        for (const [pid, count] of counts) {
          if (count > max) { max = count; id = pid } else if (count === max) id = null
        }
        return id
      })()
    : null

  // Countdown
  useEffect(() => {
    if (!round?.phase_ends_at) return
    function tick() { setSecondsLeft(Math.max(0, Math.round((new Date(round!.phase_ends_at).getTime() - Date.now()) / 1000))) }
    tick(); const id = setInterval(tick, 500); return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.phase_ends_at])

  // Reset hasAdvanced on phase change
  useEffect(() => {
    if (round?.phase && round.phase !== lastPhase.current) {
      hasAdvanced.current = false; lastPhase.current = round.phase
    }
  }, [round?.phase])

  // Open modal on describing phase
  useEffect(() => {
    if (round?.phase === 'describing' && isAlive && !submitted) setShowDescribeModal(true)
    else setShowDescribeModal(false)
  }, [round?.phase, isAlive, submitted])

  // Initial load
  useEffect(() => {
    const playerId = sessionStorage.getItem('playerId')
    if (!playerId) { router.replace(`/join?code=${code}`); return }
    setMyPlayerId(playerId)
    async function load() {
      const { data: roomData } = await supabase.from('rooms').select('*').eq('code', code).single()
      if (!roomData) return; setRoom(roomData)
      const [{ data: playersData }, { data: roundData }] = await Promise.all([
        supabase.from('players').select('*').eq('room_id', roomData.id).order('joined_at'),
        supabase.from('rounds').select('*').eq('room_id', roomData.id).order('round_number', { ascending: false }).limit(1).single(),
      ])
      if (playersData) setPlayers(playersData)
      if (roundData) { setRound(roundData); roundRef.current = roundData; await loadRoundData(roundData.id) }
      setLoading(false)
    }
    load()
  }, [code, router])

  // Phase advance
  useEffect(() => {
    if (secondsLeft !== 0) return
    if (!round || round.phase === 'result') return
    if (hasAdvanced.current) return
    hasAdvanced.current = true
    fetch(`/api/rounds/${round.id}/advance`, { method: 'POST' })
      .then(r => r.json()).then(d => console.log('Advance:', d))
      .catch(e => { console.error(e); hasAdvanced.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, round?.id, round?.phase])

  async function loadRoundData(roundId: string) {
    const [{ data: d }, { data: v }] = await Promise.all([
      supabase.from('descriptions').select('*').eq('round_id', roundId),
      supabase.from('votes').select('*').eq('round_id', roundId),
    ])
    if (d) setDescriptions(d); if (v) setVotes(v)
  }

  // Realtime
  useEffect(() => {
    if (!room) return
    const ch = supabase.channel(`game:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${room.id}` },
        async payload => {
          const u = payload.new as Round; setRound(u); roundRef.current = u
          setSubmitted(false); setVoted(false); setMyDescription('')
          setVotes([]); setDescriptions([])
          await loadRoundData(u.id)
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        async () => { const { data } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at'); if (data) setPlayers(data) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'descriptions' },
        async () => { if (roundRef.current) await loadRoundData(roundRef.current.id) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' },
        async () => { if (roundRef.current) await loadRoundData(roundRef.current.id) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        payload => { const u = payload.new as Room; setRoom(u); if (u.status === 'lobby') router.push(`/room/${code}/lobby`) })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [room, code, router])

  async function submitDescription() {
    if (!round || !myPlayerId || submitted || !myDescription.trim()) return
    setSubmitted(true); setShowDescribeModal(false)
    const res = await fetch('/api/descriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: round.id, playerId: myPlayerId, content: myDescription.trim() }),
    })
    if (!res.ok) setSubmitted(false)
  }

  async function castVote(targetId: string) {
    if (!round || !myPlayerId || !isAlive) return
    const existing = votes.find(v => v.voter_id === myPlayerId)
    if (existing?.target_id === targetId) return
    setVoted(true)
    const res = await fetch(`/api/rounds/${round.id}/vote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId: myPlayerId, targetId }),
    })
    if (!res.ok) setVoted(false)
  }

  if (loading || !round) return (
    <div className="min-h-screen flex items-center justify-center gap-3" style={{ background: 'var(--bg)' }}>
      <Spinner /><span className="text-sm" style={{ color: 'var(--text-3)' }}>Loading game…</span>
    </div>
  )

  const myWord = myPlayer?.role === 'spy' ? round.spy_word : round.civilian_word
  const phaseDuration = round.created_at
    ? Math.round((new Date(round.phase_ends_at).getTime() - new Date(round.created_at).getTime()) / 1000) : 30
  const timerPct = Math.min(100, (secondsLeft / phaseDuration) * 100)
  const isUrgent = secondsLeft <= 10 && secondsLeft > 0

  const phaseInfo: Record<string, { label: string; desc: string }> = {
    describing: { label: 'Describe', desc: 'Write a one-sentence clue about your word' },
    discussing: { label: 'Discuss', desc: 'Read the clues — who sounds suspicious?' },
    voting:     { label: 'Vote',    desc: 'Choose who you think is the spy' },
    result:     { label: 'Result',  desc: '' },
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Round {round.round_number}</span>
              <span style={{ color: 'var(--border-2)' }}>·</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{phaseInfo[round.phase]?.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xl font-display font-bold tabular-nums transition-all ${isUrgent ? 'animate-pulse' : ''}`}
                style={{ color: isUrgent ? 'var(--danger)' : 'var(--text)' }}>
                {secondsLeft}s
              </span>
              <ThemeToggle />
            </div>
          </div>
          {/* Timer bar */}
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-3)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${timerPct}%`, background: isUrgent ? 'var(--danger)' : 'var(--accent)' }} />
          </div>
          {phaseInfo[round.phase]?.desc && (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{phaseInfo[round.phase].desc}</p>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 pt-4 pb-8 space-y-4">

        {/* ── Describing phase ── */}
        {round.phase === 'describing' && (
          <div className="space-y-4">
            {/* Word card */}
            <Card className="p-5 text-center space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Your word</p>
              <p className="text-3xl font-display font-bold" style={{ color: 'var(--text)' }}>{myWord}</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Describe it in one sentence without saying it directly</p>
              {isAlive && !submitted && (
                <button onClick={() => setShowDescribeModal(true)}
                  className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: 'var(--accent)' }}>
                  ✏️ Write description
                </button>
              )}
              {submitted && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                  ✓ Submitted
                </div>
              )}
            </Card>

            {/* Player submission status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Waiting · {descriptions.length}/{alivePlayers.length}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {alivePlayers.map(p => {
                  const emoji = getPlayerEmoji(p.id)
                  const color = getPlayerColor(p.id)
                  const hasSubmitted = descriptions.some(d => d.player_id === p.id)
                  const isMe = p.id === myPlayerId
                  return (
                    <Card key={p.id} className="flex items-center gap-3 p-3"
                      style={isMe ? { borderColor: 'var(--accent)', background: 'var(--accent-bg)' } : {}}>
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-lg shrink-0`}>
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{p.nickname}</p>
                      </div>
                      <span className="text-xs font-semibold shrink-0"
                        style={{ color: hasSubmitted ? 'var(--success)' : 'var(--text-3)' }}>
                        {hasSubmitted ? '✓ Done' : '…'}
                      </span>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Discussing phase ── */}
        {round.phase === 'discussing' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {alivePlayers.map(p => {
                const emoji = getPlayerEmoji(p.id)
                const color = getPlayerColor(p.id)
                const desc = descriptions.find(d => d.player_id === p.id)
                const isMe = p.id === myPlayerId
                return (
                  <Card key={p.id} className="p-4 space-y-3"
                    style={isMe ? { borderColor: 'var(--accent)' } : {}}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-base shrink-0`}>
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{p.nickname}</span>
                          {isMe && <span className="text-xs" style={{ color: 'var(--text-3)' }}>(you)</span>}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: desc ? 'var(--text)' : 'var(--text-3)' }}>
                      {desc?.content ?? <em>No description submitted</em>}
                    </p>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Voting phase ── */}
        {round.phase === 'voting' && (
          <div className="space-y-3">
            {!isAlive && (
              <div className="text-center py-3 text-sm rounded-xl" style={{ background: 'var(--bg-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                You were eliminated — watching only
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {alivePlayers.filter(p => p.id !== myPlayerId).map(p => {
                const emoji = getPlayerEmoji(p.id)
                const color = getPlayerColor(p.id)
                const voteCount = votes.filter(v => v.target_id === p.id).length
                const iVotedFor = !!votes.find(v => v.voter_id === myPlayerId && v.target_id === p.id)
                return (
                  <button key={p.id} onClick={() => castVote(p.id)} disabled={!isAlive}
                    className="w-full text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl"
                    style={{
                      background: iVotedFor ? 'var(--accent-bg)' : 'var(--card)',
                      border: `1px solid ${iVotedFor ? 'var(--accent)' : 'var(--card-border)'}`,
                    }}>
                    <div className="flex items-center gap-3 p-3.5">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-xl shrink-0`}>
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{p.nickname}</p>
                        {iVotedFor && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>Your vote · tap another to change</p>
                        )}
                        {voteCount > 0 && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-3)' }}>
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${(voteCount / alivePlayers.length) * 100}%`, background: 'var(--danger)' }} />
                            </div>
                            <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-3)' }}>
                              {voteCount}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
              {votes.length}/{alivePlayers.length} voted
            </p>
          </div>
        )}

        {/* ── Result phase ── */}
        {round.phase === 'result' && (
          <ResultPhase players={players} round={round} eliminatedPlayerId={eliminatedPlayerId} />
        )}
      </div>

      {/* ── Describe modal ── */}
      {showDescribeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fadeIn"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4 animate-scaleIn"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Your word</p>
              <p className="text-3xl font-display font-bold" style={{ color: 'var(--text)' }}>{myWord}</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>One sentence. Don&apos;t say the word directly.</p>
            </div>
            <textarea
              rows={3} autoFocus
              placeholder="e.g. You use this every morning to start your day…"
              value={myDescription}
              onChange={e => setMyDescription(e.target.value)}
              maxLength={200}
              className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-none transition-all"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-bg)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
            />
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-3)' }}>
              <span>{myDescription.length}/200</span>
              <span className={isUrgent ? 'font-bold' : ''} style={{ color: isUrgent ? 'var(--danger)' : 'var(--text-3)' }}>
                {secondsLeft}s left
              </span>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setShowDescribeModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                Later
              </button>
              <button onClick={submitDescription} disabled={!myDescription.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Result Phase ──────────────────────────────────────────────
function ResultPhase({ players, round, eliminatedPlayerId }: {
  players: Player[]; round: Round; eliminatedPlayerId: string | null
}) {
  const eliminated = eliminatedPlayerId ? players.find(p => p.id === eliminatedPlayerId) : null
  const alivePlayers = players.filter(p => p.is_alive)
  const spiesAlive = alivePlayers.filter(p => p.role === 'spy')
  const civiliansAlive = alivePlayers.filter(p => p.role === 'civilian')
  const gameOver = spiesAlive.length === 0 || spiesAlive.length >= civiliansAlive.length
  const civWin = spiesAlive.length === 0

  return (
    <div className="space-y-4 animate-fadeUp">

      {/* Eliminated */}
      {eliminated && (
        <Card className="p-5 text-center space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Eliminated</p>
          <div className={`w-14 h-14 rounded-2xl mx-auto bg-gradient-to-br ${getPlayerColor(eliminated.id).bg} flex items-center justify-center text-3xl`}>
            {getPlayerEmoji(eliminated.id)}
          </div>
          <div>
            <p className="text-lg font-display font-bold" style={{ color: 'var(--text)' }}>{eliminated.nickname}</p>
            <Badge variant={eliminated.role === 'spy' ? 'danger' : 'default'}>
              {eliminated.role === 'spy' ? '🕵️ The Spy' : '👤 Civilian'}
            </Badge>
          </div>
        </Card>
      )}

      {gameOver ? (
        <Card className="p-5 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-4xl">{civWin ? '🎉' : '🕵️'}</p>
            <p className="text-xl font-display font-bold" style={{ color: 'var(--text)' }}>
              {civWin ? 'Civilians win!' : 'Spies win!'}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Civilians had <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{round.civilian_word}</span>
              {' · '}Spies had <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{round.spy_word}</span>
            </p>
          </div>

          {/* Role reveal */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>All roles</p>
            {players.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{ background: p.role === 'spy' ? 'var(--danger-bg)' : 'var(--bg-2)', border: `1px solid ${p.role === 'spy' ? 'var(--danger)' : 'var(--border)'}` }}>
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${getPlayerColor(p.id).bg} flex items-center justify-center text-base shrink-0`}>
                  {getPlayerEmoji(p.id)}
                </div>
                <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text)' }}>{p.nickname}</span>
                <span className="text-xs font-semibold" style={{ color: p.role === 'spy' ? 'var(--danger)' : 'var(--text-3)' }}>
                  {p.role === 'spy' ? '🕵️ Spy' : '👤 Civilian'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-center animate-pulse" style={{ color: 'var(--text-3)' }}>Returning to lobby…</p>
        </Card>
      ) : (
        <Card className="p-5 text-center space-y-2">
          <p className="text-2xl">⏳</p>
          <p className="text-lg font-display font-bold" style={{ color: 'var(--text)' }}>Round over</p>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            {spiesAlive.length} spy{spiesAlive.length !== 1 ? 'ies' : ''} still hidden…
          </p>
          <p className="text-xs animate-pulse" style={{ color: 'var(--text-3)' }}>Next round starting…</p>
        </Card>
      )}
    </div>
  )
}