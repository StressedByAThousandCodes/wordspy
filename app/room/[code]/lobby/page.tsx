'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerEmoji, getPlayerColor } from '@/lib/player'
import { Button, Card, Badge, Spinner } from '@/components/ui'
import { ThemeToggle } from '@/components/theme'
import type { Player, Room, ChatMessage } from '@/types'

type SettingsTab = 'game' | 'players' | 'timers'

export default function LobbyPage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('game')
  const [showQR, setShowQR] = useState(false)
  const [newPlayerIds, setNewPlayerIds] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const prevPlayerIds = useRef<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const myPlayer = players.find(p => p.id === myPlayerId)
  const isHost = room?.host_id === myPlayerId
  const readyCount = players.filter(p => p.is_ready).length
  const minPlayers = room?.min_players ?? 3
  const maxPlayers = room?.max_players ?? 16
  const canStart = players.length >= minPlayers && readyCount >= players.length
  const readyPct = players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0

  useEffect(() => {
    const playerId = sessionStorage.getItem('playerId')
    if (!playerId) { router.replace(`/join?code=${code}`); return }
    setMyPlayerId(playerId)
    async function load() {
      const { data: roomData } = await supabase.from('rooms').select('*').eq('code', code).single()
      if (!roomData) { setError('Room not found'); setLoading(false); return }
      setRoom(roomData)
      const [{ data: playersData }, { data: messagesData }] = await Promise.all([
        supabase.from('players').select('*').eq('room_id', roomData.id).order('joined_at'),
        supabase.from('messages').select('*').eq('room_id', roomData.id).order('created_at').limit(100),
      ])
      if (playersData) { setPlayers(playersData); prevPlayerIds.current = new Set(playersData.map((p: Player) => p.id)) }
      if (messagesData) setMessages(messagesData)
      setLoading(false)
    }
    load()
  }, [code, router])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!room) return
    const channel = supabase.channel(`lobby:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        async () => {
          const { data } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at')
          if (!data) return
          const incoming = new Set(data.map((p: Player) => p.id))
          const brand = new Set([...incoming].filter(id => !prevPlayerIds.current.has(id)))
          if (brand.size > 0) { setNewPlayerIds(brand); setTimeout(() => setNewPlayerIds(new Set()), 1000) }
          prevPlayerIds.current = incoming
          setPlayers(data)
          const { data: currentRoom } = await supabase.from('rooms').select('*').eq('code', code).single()
          if (!currentRoom) return
          const hostStillHere = data.some((p: Player) => p.id === currentRoom.host_id)
          if (!hostStillHere && data.length > 0) {
            const earliest = [...data].sort((a: Player, b: Player) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())[0]
            if (earliest.id === myPlayerId) {
              const newHost = data[Math.floor(Math.random() * data.length)]
              await supabase.from('rooms').update({ host_id: newHost.id }).eq('id', currentRoom.id)
            }
          }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        payload => { const updated = payload.new as Room; setRoom(updated); if (updated.status === 'playing') router.push(`/room/${code}/game`) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        payload => setMessages(prev => [...prev, payload.new as ChatMessage]))
        // Detect presence disconnects — remove players who leave without clicking Leave
      .on('presence', { event: 'leave' }, async ({ leftPresences }: any) => {
        for (const presence of leftPresences) {
          if (presence.playerId && presence.playerId !== myPlayerId) {
            await supabase.from('players').delete().eq('id', presence.playerId)
          }
        }
      })
      .subscribe()
      // Track this player's presence
    channel.track({ playerId: myPlayerId })
    return () => { supabase.removeChannel(channel) }
  }, [room, code, router, myPlayerId])

  async function toggleReady() {
    if (!myPlayer) return
    await supabase.from('players').update({ is_ready: !myPlayer.is_ready }).eq('id', myPlayer.id)
  }

  async function startGame() {
    setStarting(true); setError('')
    try {
      const res = await fetch(`/api/rooms/${code}/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start')
    } catch (e: any) { setError(e.message); setStarting(false) }
  }

  async function updateSetting(key: string, value: number) {
    await fetch(`/api/rooms/${code}/settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    setRoom(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function handleLeave() {
    setLeaving(true)
    if (myPlayerId) {
      // Delete via API to use service role key — more reliable than client delete
      await fetch(`/api/players/${myPlayerId}`, { method: 'DELETE' })
    }
    sessionStorage.removeItem('playerId')
    sessionStorage.removeItem('deviceToken')
    sessionStorage.removeItem('nickname')
    router.push('/')
  }

  async function sendMessage() {
    if (!chatInput.trim() || !myPlayerId || !room) return
    setSendingChat(true)
    const content = chatInput.trim(); setChatInput('')
    await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, playerId: myPlayerId, content }),
    })
    setSendingChat(false); chatInputRef.current?.focus()
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/room/${code}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center gap-3">
      <Spinner /><span className="text-sm" style={{ color: 'var(--text-3)' }}>Loading lobby…</span>
    </div>
  )

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${code}` : ''
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=7c3aed&margin=12`

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 h-13 flex items-center gap-3 py-2.5">
          <button onClick={() => router.push('/')}
            className="flex items-center gap-2 font-display font-bold text-base transition-opacity hover:opacity-70"
            style={{ color: 'var(--text)' }}>
            <span>🕵️</span>
            <span className="hidden sm:inline">WordSpy</span>
          </button>

          <span style={{ color: 'var(--border-2)' }}>/</span>

          {/* Room code */}
          <div className="flex items-center gap-2 flex-1">
            <span className="font-display font-bold text-sm tracking-widest" style={{ color: 'var(--accent)' }}>{code}</span>
            <button onClick={copyLink}
              className="text-xs px-2 py-1 rounded-lg transition-all"
              style={{ background: 'var(--bg-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button onClick={() => setShowQR(!showQR)}
              className="text-xs px-2 py-1 rounded-lg transition-all hidden sm:block"
              style={{ background: 'var(--bg-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              QR
            </button>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            {isHost && (
              <button onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all font-medium"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <span>⚙️</span><span className="hidden sm:inline">Settings</span>
              </button>
            )}
            <button onClick={handleLeave} disabled={leaving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all font-medium"
              style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
              <span>🚪</span><span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── QR panel ── */}
      {showQR && (
        <div className="border-b py-4 animate-fadeIn" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
          <div className="max-w-xs mx-auto flex items-center gap-4 px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR" width={80} height={80} className="rounded-xl shrink-0" />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Scan to join</p>
              <p className="text-xs mt-1 break-all" style={{ color: 'var(--text-3)' }}>{shareUrl}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full">

        {/* LEFT — players */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-36 lg:pb-6 space-y-4">

            {/* Ready progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>Players ready</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                  {readyCount}/{players.length}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-3)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${readyPct}%`, background: 'var(--accent)' }} />
              </div>
              {players.length < minPlayers && (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  Need {minPlayers - players.length} more player{minPlayers - players.length !== 1 ? 's' : ''} to start
                </p>
              )}
            </div>

            {/* Player grid */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Players · {players.length}/{maxPlayers}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {players.map(p => {
                  const emoji = getPlayerEmoji(p.id)
                  const color = getPlayerColor(p.id)
                  const isMe = p.id === myPlayerId
                  const isNew = newPlayerIds.has(p.id)
                  return (
                    <Card key={p.id}
                      className={`relative flex items-center gap-3 p-3 pl-4 overflow-hidden transition-all duration-300 ${isNew ? 'scale-[1.01]' : ''}`}
                      style={isMe
                        ? { borderColor: 'var(--accent)', background: 'var(--accent-bg)' }
                        : { borderColor: 'var(--border)', background: 'var(--bg-2)' }
                      }>
                      {/* Colored left strip */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-gradient-to-b ${color.bg}`} />
                      {/* Avatar */}
                      <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-lg shrink-0`}>
                        {emoji}
                        {p.is_ready && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold text-white"
                            style={{ background: 'var(--success)', borderColor: 'var(--bg)' }}>✓</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{p.nickname}</span>
                          {room?.host_id === p.id && <Badge variant="warning">Host</Badge>}
                          {isMe && <span className="text-xs" style={{ color: 'var(--text-3)' }}>(you)</span>}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: p.is_ready ? 'var(--success)' : 'var(--text-3)' }}>
                          {p.is_ready ? '✓ Ready' : 'Not ready'}
                        </p>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Mobile chat */}
            <div className="lg:hidden">
              <ChatPanel
                messages={messages} players={players} myPlayerId={myPlayerId}
                room={room} chatInput={chatInput} setChatInput={setChatInput}
                sendMessage={sendMessage} sendingChat={sendingChat}
                chatEndRef={chatEndRef} chatInputRef={chatInputRef}
              />
            </div>
          </div>

          {/* Mobile bottom bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t px-4 pt-3 pb-6 z-20"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            {error && <p className="text-xs mb-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</p>}
            <div className="space-y-2">
              <Button variant={myPlayer?.is_ready ? 'secondary' : 'success'} size="lg" onClick={toggleReady}>
                {myPlayer?.is_ready ? '✕ Cancel Ready' : '✓ Ready Up'}
              </Button>
              {isHost && (
                <Button variant="primary" size="lg" loading={starting} disabled={!canStart} onClick={startGame}>
                  {canStart ? 'Start Game' : players.length < minPlayers
                    ? `Need ${minPlayers - players.length} more`
                    : `Waiting (${readyCount}/${players.length} ready)`}
                </Button>
              )}
            </div>
          </div>

          {/* Desktop bottom bar */}
          <div className="hidden lg:block border-t px-6 py-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            {error && <p className="text-xs mb-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</p>}
            <div className="flex gap-3">
              <Button variant={myPlayer?.is_ready ? 'secondary' : 'success'} size="lg" className="flex-1" onClick={toggleReady}>
                {myPlayer?.is_ready ? '✕ Cancel Ready' : '✓ Ready Up'}
              </Button>
              {isHost && (
                <Button variant="primary" size="lg" className="flex-1" loading={starting} disabled={!canStart} onClick={startGame}>
                  {canStart ? 'Start Game' : players.length < minPlayers
                    ? `Need ${minPlayers - players.length} more`
                    : `Waiting (${readyCount}/${players.length} ready)`}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — desktop chat */}
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Chat</p>
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>{messages.length}</span>
          </div>
          <ChatPanel
            messages={messages} players={players} myPlayerId={myPlayerId}
            room={room} chatInput={chatInput} setChatInput={setChatInput}
            sendMessage={sendMessage} sendingChat={sendingChat}
            chatEndRef={chatEndRef} chatInputRef={chatInputRef}
            fullHeight
          />
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && isHost && room && (
        <SettingsModal
          room={room} players={players}
          settingsTab={settingsTab} setSettingsTab={setSettingsTab}
          updateSetting={updateSetting} onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ── Chat Panel ────────────────────────────────────────────────
function ChatPanel({ messages, players, myPlayerId, room, chatInput, setChatInput,
  sendMessage, sendingChat, chatEndRef, chatInputRef, fullHeight = false }: {
  messages: ChatMessage[]; players: Player[]; myPlayerId: string | null; room: Room | null
  chatInput: string; setChatInput: (v: string) => void; sendMessage: () => void
  sendingChat: boolean; chatEndRef: React.RefObject<HTMLDivElement>
  chatInputRef: React.RefObject<HTMLInputElement>; fullHeight?: boolean
}) {
  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden lg:rounded-none ${fullHeight ? 'flex-1' : ''}`}
      style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
      <div className="lg:hidden px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Chat</p>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{messages.length}</span>
      </div>
      <div className={`overflow-y-auto px-3 py-3 space-y-3 ${fullHeight ? 'flex-1' : 'h-48'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
            <span className="text-2xl opacity-20">💬</span>
            <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>No messages yet</p>
          </div>
        )}
        {messages.map(msg => {
          const sender = players.find(p => p.id === msg.player_id)
          const isMe = msg.player_id === myPlayerId
          const emoji = sender ? getPlayerEmoji(sender.id) : '❓'
          const color = sender ? getPlayerColor(sender.id) : { bg: 'from-zinc-400 to-zinc-500' }
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${color.bg} flex items-center justify-center text-xs shrink-0`}>
                {emoji}
              </div>
              <div className={`max-w-[78%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-[10px] font-medium px-1" style={{ color: 'var(--text-3)' }}>
                    {sender?.nickname ?? 'Unknown'}
                  </span>
                )}
                <div className="px-3 py-2 rounded-2xl text-xs leading-relaxed break-words"
                  style={isMe
                    ? { background: 'var(--accent)', color: 'white', borderBottomRightRadius: '4px' }
                    : { background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', borderBottomLeftRadius: '4px' }
                  }>
                  {msg.content}
                </div>
                <span className="text-[10px] px-1" style={{ color: 'var(--text-3)' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>
      <div className="border-t px-3 py-2.5 flex gap-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
        <input
          ref={chatInputRef}
          type="text"
          placeholder="Say something…"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          maxLength={200}
          className="flex-1 rounded-xl px-3 py-2 text-xs outline-none transition-all min-w-0"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
        />
        <button onClick={sendMessage} disabled={!chatInput.trim() || sendingChat}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm shrink-0 disabled:opacity-40 transition-opacity"
          style={{ background: 'var(--accent)' }}>
          {sendingChat ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : '↑'}
        </button>
      </div>
    </div>
  )
}

// ── Settings Modal ────────────────────────────────────────────
function SettingsModal({ room, players, settingsTab, setSettingsTab, updateSetting, onClose }: {
  room: Room; players: Player[]; settingsTab: SettingsTab
  setSettingsTab: (t: SettingsTab) => void; updateSetting: (key: string, value: number) => void; onClose: () => void
}) {
  const minPlayers = room.min_players ?? 3
  const maxPlayers = room.max_players ?? 16
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'game', label: '🎮 Game' },
    { id: 'players', label: '👥 Players' },
    { id: 'timers', label: '⏱ Timers' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scaleIn"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-display font-bold" style={{ color: 'var(--text)' }}>Settings</h2>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all hover:opacity-70"
            style={{ background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            ✕
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setSettingsTab(tab.id)}
              className="flex-1 py-2.5 text-xs font-semibold transition-all"
              style={{
                color: settingsTab === tab.id ? 'var(--accent)' : 'var(--text-3)',
                borderBottom: settingsTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                background: settingsTab === tab.id ? 'var(--accent-bg)' : 'transparent',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">

          {settingsTab === 'game' && (
            <div className="space-y-4">
              <SettingCard icon="🕵️" label="Spies" description="Hidden players with a different word"
                value={room.spy_count} min={1} max={Math.max(1, Math.floor(players.length / 3))} step={1}
                onChange={v => updateSetting('spy_count', v)} />
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Quick presets</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Casual', spies: 1, describe: 30, discuss: 60, vote: 30 },
                    { label: 'Standard', spies: 1, describe: 45, discuss: 90, vote: 45 },
                    { label: 'Intense', spies: 2, describe: 20, discuss: 45, vote: 20 },
                  ].map(p => (
                    <button key={p.label}
                      onClick={() => { updateSetting('spy_count', p.spies); updateSetting('describe_seconds', p.describe); updateSetting('discuss_seconds', p.discuss); updateSetting('vote_seconds', p.vote) }}
                      className="py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)' }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.color = 'var(--text-2)' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {settingsTab === 'players' && (
            <div className="space-y-4">
              <SettingCard icon="👥" label="Minimum Players" description="Game won't start below this"
                value={minPlayers} min={3} max={maxPlayers} step={1}
                onChange={v => updateSetting('min_players', v)} />
              <SettingCard icon="🎟️" label="Maximum Players" description="Room closes above this"
                value={maxPlayers} min={minPlayers} max={16} step={1}
                onChange={v => updateSetting('max_players', v)} />
            </div>
          )}

          {settingsTab === 'timers' && (
            <div className="space-y-4">
              <TimerSetting icon="📝" label="Describe" description="Time to write a description"
                value={room.describe_seconds} min={10} max={300} onChange={v => updateSetting('describe_seconds', v)} />
              <TimerSetting icon="💬" label="Discuss" description="Time to read and discuss"
                value={room.discuss_seconds} min={15} max={600} onChange={v => updateSetting('discuss_seconds', v)} />
              <TimerSetting icon="🗳️" label="Vote" description="Time to cast votes"
                value={room.vote_seconds} min={10} max={300} onChange={v => updateSetting('vote_seconds', v)} />
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Round total: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtSec(room.describe_seconds + room.discuss_seconds + room.vote_seconds)}</span>
              </p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <Button variant="primary" size="lg" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}

function SettingCard({ icon, label, description, value, min, max, step, onChange }: {
  icon: string; label: string; description: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <div>
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><span>{icon}</span>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}
          className="w-9 h-9 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>−</button>
        <span className="flex-1 text-center text-xl font-display font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}
          className="w-9 h-9 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>+</button>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-3)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${((value - min) / (max - min)) * 100}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  )
}

function TimerSetting({ icon, label, description, value, min, max, onChange }: {
  icon: string; label: string; description: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  const [inputVal, setInputVal] = useState(String(value))
  useEffect(() => { setInputVal(String(value)) }, [value])
  function handleBlur() {
    const n = parseInt(inputVal)
    if (!isNaN(n)) { const c = Math.min(max, Math.max(min, n)); onChange(c); setInputVal(String(c)) }
    else setInputVal(String(value))
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
      <div>
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><span>{icon}</span>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - 5))} disabled={value <= min}
          className="w-9 h-9 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>−5</button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <input type="number" value={inputVal}
            onChange={e => setInputVal(e.target.value)} onBlur={handleBlur}
            onKeyDown={e => e.key === 'Enter' && handleBlur()}
            className="w-16 text-center text-lg font-display font-bold rounded-xl py-1.5 outline-none transition-all"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlurCapture={e => { e.target.style.borderColor = 'var(--border)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>sec</span>
        </div>
        <button onClick={() => onChange(Math.min(max, value + 5))} disabled={value >= max}
          className="w-9 h-9 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>+5</button>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(parseInt(e.target.value))} />
      <div className="flex gap-1.5 flex-wrap">
        {[15, 30, 45, 60, 90, 120].filter(v => v >= min && v <= max).map(v => (
          <button key={v} onClick={() => onChange(v)}
            className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-all"
            style={value === v
              ? { background: 'var(--accent)', color: 'white' }
              : { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
            {v}s
          </button>
        ))}
      </div>
      <p className="text-xs font-semibold text-right" style={{ color: 'var(--accent)' }}>{fmtSec(value)}</p>
    </div>
  )
}

function fmtSec(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}