'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerEmoji, getPlayerColor } from '@/lib/player'
import type { Player, Room, ChatMessage } from '@/types'

// ── Types ─────────────────────────────────────────────────────
type SettingsTab = 'game' | 'players' | 'timers'

// ── Constants ─────────────────────────────────────────────────
const MIN_PLAYERS_LIMIT = 3
const MAX_PLAYERS_LIMIT = 16

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
  const minPlayers = (room as any)?.min_players ?? 3
  const maxPlayers = (room as any)?.max_players ?? 16
  const canStart = players.length >= minPlayers && readyCount >= players.length
  const readyPct = players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0

  // ── Load ──────────────────────────────────────────────────────
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
      if (playersData) {
        setPlayers(playersData)
        prevPlayerIds.current = new Set(playersData.map((p: Player) => p.id))
      }
      if (messagesData) setMessages(messagesData)
      setLoading(false)
    }
    load()
  }, [code, router])

  // ── Auto scroll chat ──────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Realtime ──────────────────────────────────────────────────
  useEffect(() => {
    if (!room) return
    const channel = supabase.channel(`lobby:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        async () => {
          const { data } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at')
          if (!data) return
          const incoming = new Set(data.map((p: Player) => p.id))
          const brand = new Set([...incoming].filter(id => !prevPlayerIds.current.has(id)))
          if (brand.size > 0) { setNewPlayerIds(brand); setTimeout(() => setNewPlayerIds(new Set()), 800) }
          prevPlayerIds.current = incoming
          setPlayers(data)

          // Host promotion if host left
          const { data: currentRoom } = await supabase.from('rooms').select('*').eq('code', code).single()
          if (!currentRoom) return
          const hostStillHere = data.some((p: Player) => p.id === currentRoom.host_id)
          if (!hostStillHere && data.length > 0) {
            const earliest = [...data].sort((a: Player, b: Player) =>
              new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())[0]
            if (earliest.id === myPlayerId) {
              const newHost = data[Math.floor(Math.random() * data.length)]
              await supabase.from('rooms').update({ host_id: newHost.id }).eq('id', currentRoom.id)
            }
          }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        payload => {
          const updated = payload.new as Room
          setRoom(updated)
          if (updated.status === 'playing') router.push(`/room/${code}/game`)
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        payload => setMessages(prev => [...prev, payload.new as ChatMessage]))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [room, code, router, myPlayerId])

  // ── Actions ───────────────────────────────────────────────────
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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    setRoom(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function handleLeave() {
    setLeaving(true)
    if (myPlayerId) {
      await supabase.from('players').delete().eq('id', myPlayerId)
    }
    sessionStorage.removeItem('playerId')
    router.push('/')
  }

  async function sendMessage() {
    if (!chatInput.trim() || !myPlayerId || !room) return
    setSendingChat(true)
    const content = chatInput.trim()
    setChatInput('')
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, playerId: myPlayerId, content }),
    })
    setSendingChat(false)
    chatInputRef.current?.focus()
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/room/${code}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <LobbyLoading />

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${code}` : ''
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&bgcolor=09090f&color=a78bfa&margin=16`

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* ── Top nav bar ── */}
      <header className="relative z-30 border-b border-zinc-900 bg-[#0a0a0f]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Left — home + room code */}
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition text-sm font-medium">
              <span>🕵️</span>
              <span className="hidden sm:inline font-display font-black text-white">WordSpy</span>
            </button>
            <span className="text-zinc-800">/</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-violet-400 tracking-widest text-sm">{code}</span>
              <button onClick={copyLink}
                className="text-zinc-600 hover:text-white transition text-xs px-2 py-1 rounded-lg hover:bg-zinc-800">
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button onClick={() => setShowQR(!showQR)}
                className="text-zinc-600 hover:text-white transition text-xs px-2 py-1 rounded-lg hover:bg-zinc-800 hidden sm:block">
                QR
              </button>
            </div>
          </div>

          {/* Right — actions */}
          <div className="flex items-center gap-2">
            {isHost && (
              <button onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-xl transition">
                <span>⚙️</span>
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
            <button onClick={handleLeave} disabled={leaving}
              className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-700/40 px-3 py-1.5 rounded-xl transition disabled:opacity-50">
              <span>🚪</span>
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── QR dropdown ── */}
      {showQR && (
        <div className="relative z-20 flex justify-center py-3 border-b border-zinc-900 bg-[#0a0a0f]">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR code" width={120} height={120} className="rounded-xl" />
            <div>
              <p className="text-sm font-bold text-white">Scan to join</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-[200px] break-all">{shareUrl}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout — single column mobile, two column desktop ── */}
      <div className="relative z-10 flex-1 flex overflow-hidden max-w-7xl mx-auto w-full">

        {/* ── LEFT COLUMN — players + actions ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto px-4 pt-5 pb-40 lg:pb-6 space-y-4">

            {/* Ready bar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">Ready to play</span>
                <span className="text-xs font-bold text-violet-400 tabular-nums">{readyCount} / {players.length}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${readyPct}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)' }} />
              </div>
              {players.length < minPlayers && (
                <p className="text-xs text-zinc-600 text-center">
                  Need at least {minPlayers} players to start
                  {players.length < minPlayers ? ` (${minPlayers - players.length} more needed)` : ''}
                </p>
              )}
            </div>

            {/* Player list */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest px-1">
                Players — {players.length} / {maxPlayers}
              </p>

              {/* Desktop grid — 2 columns on lg+ */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {players.map(p => {
                  const emoji = getPlayerEmoji(p.id)
                  const color = getPlayerColor(p.id)
                  const isNew = newPlayerIds.has(p.id)
                  const isMe = p.id === myPlayerId
                  return (
                    <div key={p.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300
                        ${isNew ? 'scale-[1.02] border-violet-500/50 bg-violet-500/5' : ''}
                        ${isMe ? 'border-violet-500/30 bg-violet-500/5' : 'border-zinc-800 bg-zinc-900/60'}
                      `}>
                      <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-2xl shrink-0 shadow-lg`}>
                        {emoji}
                        {p.is_ready && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0a0a0f] flex items-center justify-center">
                            <span className="text-[8px] text-white font-bold">✓</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm truncate">{p.nickname}</span>
                          {room?.host_id === p.id && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">HOST</span>
                          )}
                          {isMe && <span className="text-[10px] text-zinc-500">(you)</span>}
                        </div>
                        <p className={`text-xs mt-0.5 font-medium ${p.is_ready ? 'text-green-400' : 'text-zinc-600'}`}>
                          {p.is_ready ? '✓ Ready to play' : 'Not ready'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Mobile-only chat */}
            <div className="lg:hidden">
              <ChatPanel
                messages={messages}
                players={players}
                myPlayerId={myPlayerId}
                room={room}
                chatInput={chatInput}
                setChatInput={setChatInput}
                sendMessage={sendMessage}
                sendingChat={sendingChat}
                chatEndRef={chatEndRef}
                chatInputRef={chatInputRef}
              />
            </div>
          </div>

          {/* ── Bottom action bar — mobile only ── */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0f] border-t border-zinc-900 z-20">
            <div className="max-w-sm mx-auto px-4 pt-3 pb-6 space-y-2">
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <span>⚠️</span><span>{error}</span>
                </div>
              )}
              <button onClick={toggleReady}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all duration-200
                  ${myPlayer?.is_ready
                    ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                    : 'text-white'}`}
                style={myPlayer?.is_ready ? {} : { background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                {myPlayer?.is_ready ? '✕ Cancel Ready' : '✓ Ready Up'}
              </button>
              {isHost && (
                <button onClick={startGame} disabled={!canStart || starting}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: canStart ? 'linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)' : '#27272a' }}>
                  {starting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Starting…
                    </span>
                  ) : canStart ? '🚀 Start Game!'
                    : players.length < minPlayers ? `Need ${minPlayers - players.length} more player${minPlayers - players.length !== 1 ? 's' : ''}`
                    : `Waiting for all to ready up (${readyCount}/${players.length})`}
                </button>
              )}
            </div>
          </div>

          {/* ── Desktop action bar ── */}
          <div className="hidden lg:block border-t border-zinc-900 bg-[#0a0a0f] px-6 py-4">
            <div className="flex items-center gap-3">
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex-1">
                  <span>⚠️</span><span>{error}</span>
                </div>
              )}
              <button onClick={toggleReady}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all duration-200
                  ${myPlayer?.is_ready
                    ? 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                    : 'text-white'}`}
                style={myPlayer?.is_ready ? {} : { background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                {myPlayer?.is_ready ? '✕ Cancel Ready' : '✓ Ready Up'}
              </button>
              {isHost && (
                <button onClick={startGame} disabled={!canStart || starting}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: canStart ? 'linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)' : '#27272a' }}>
                  {starting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Starting…
                    </span>
                  ) : canStart ? '🚀 Start Game!'
                    : players.length < minPlayers ? `Need ${minPlayers - players.length} more player${minPlayers - players.length !== 1 ? 's' : ''}`
                    : `Waiting for all to ready up (${readyCount}/${players.length})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — chat (desktop only) ── */}
        <div className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-zinc-900 shrink-0">
          <div className="px-4 py-3.5 border-b border-zinc-900 flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">💬 Lobby Chat</p>
            <span className="text-xs text-zinc-700">{messages.length} messages</span>
          </div>
          <ChatPanel
            messages={messages}
            players={players}
            myPlayerId={myPlayerId}
            room={room}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendMessage={sendMessage}
            sendingChat={sendingChat}
            chatEndRef={chatEndRef}
            chatInputRef={chatInputRef}
            fullHeight
          />
        </div>
      </div>

      {/* ── Settings modal ── */}
      {showSettings && isHost && room && (
        <SettingsModal
          room={room}
          players={players}
          settingsTab={settingsTab}
          setSettingsTab={setSettingsTab}
          updateSetting={updateSetting}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ── Chat Panel Component ───────────────────────────────────────

function ChatPanel({
  messages, players, myPlayerId, room, chatInput, setChatInput,
  sendMessage, sendingChat, chatEndRef, chatInputRef, fullHeight = false,
}: {
  messages: ChatMessage[]
  players: Player[]
  myPlayerId: string | null
  room: Room | null
  chatInput: string
  setChatInput: (v: string) => void
  sendMessage: () => void
  sendingChat: boolean
  chatEndRef: React.RefObject<HTMLDivElement>
  chatInputRef: React.RefObject<HTMLInputElement>
  fullHeight?: boolean
}) {
  return (
    <div className={`flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden lg:rounded-none lg:border-0 lg:bg-transparent ${fullHeight ? 'flex-1' : ''}`}>
      {/* Mobile label */}
      <div className="lg:hidden px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">💬 Lobby Chat</p>
        <span className="text-xs text-zinc-700">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className={`overflow-y-auto px-3 py-3 space-y-3 ${fullHeight ? 'flex-1' : 'h-52'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-6">
            <span className="text-3xl opacity-30">💬</span>
            <p className="text-center text-zinc-700 text-xs">No messages yet — say hi! 👋</p>
          </div>
        )}
        {messages.map(msg => {
          const sender = players.find(p => p.id === msg.player_id)
          const isMe = msg.player_id === myPlayerId
          const emoji = sender ? getPlayerEmoji(sender.id) : '❓'
          const color = sender ? getPlayerColor(sender.id) : { bg: 'from-zinc-500 to-zinc-600' }
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-sm shrink-0`}>
                {emoji}
              </div>
              <div className={`max-w-[75%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-[10px] text-zinc-600 font-medium px-1">
                    {sender?.nickname ?? 'Unknown'}
                  </span>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words
                  ${isMe ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'}`}>
                  {msg.content}
                </div>
                <span className="text-[10px] text-zinc-700 px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 px-3 py-2.5 flex gap-2 bg-[#0a0a0f]/50">
        <input
          ref={chatInputRef}
          type="text"
          placeholder="Say something…"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          maxLength={200}
          className="flex-1 bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition min-w-0"
        />
        <button onClick={sendMessage} disabled={!chatInput.trim() || sendingChat}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition shrink-0 text-sm font-bold"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
          {sendingChat
            ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : '↑'}
        </button>
      </div>
    </div>
  )
}

// ── Settings Modal ────────────────────────────────────────────

function SettingsModal({ room, players, settingsTab, setSettingsTab, updateSetting, onClose }: {
  room: Room
  players: Player[]
  settingsTab: SettingsTab
  setSettingsTab: (t: SettingsTab) => void
  updateSetting: (key: string, value: number) => void
  onClose: () => void
}) {
  const minPlayers = (room as any)?.min_players ?? 3
  const maxPlayers = (room as any)?.max_players ?? 16

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'game', label: 'Game', icon: '🎮' },
    { id: 'players', label: 'Players', icon: '👥' },
    { id: 'timers', label: 'Timers', icon: '⏱️' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-black text-white font-display">Game Settings</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition flex items-center justify-center text-sm">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setSettingsTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition
                ${settingsTab === tab.id
                  ? 'text-violet-400 border-b-2 border-violet-500 bg-violet-500/5'
                  : 'text-zinc-500 hover:text-zinc-300'}`}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* Game tab */}
          {settingsTab === 'game' && (
            <div className="space-y-4">
              <SettingCard
                icon="🕵️"
                label="Number of Spies"
                description="How many spies are hidden among players"
                value={room.spy_count}
                min={1}
                max={Math.max(1, Math.floor(players.length / 3))}
                step={1}
                onChange={v => updateSetting('spy_count', v)}
              />
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Quick presets</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Casual', desc: '1 spy, 30s each', spies: 1, describe: 30, discuss: 60, vote: 30 },
                    { label: 'Standard', desc: '1 spy, 45s each', spies: 1, describe: 45, discuss: 90, vote: 45 },
                    { label: 'Intense', desc: '2 spies, 20s', spies: 2, describe: 20, discuss: 45, vote: 20 },
                  ].map(preset => (
                    <button key={preset.label}
                      onClick={() => {
                        updateSetting('spy_count', preset.spies)
                        updateSetting('describe_seconds', preset.describe)
                        updateSetting('discuss_seconds', preset.discuss)
                        updateSetting('vote_seconds', preset.vote)
                      }}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-violet-500/50 transition text-center">
                      <span className="text-xs font-bold text-white">{preset.label}</span>
                      <span className="text-[10px] text-zinc-500 leading-tight">{preset.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Players tab */}
          {settingsTab === 'players' && (
            <div className="space-y-4">
              <SettingCard
                icon="👥"
                label="Minimum Players"
                description="Game won't start below this number"
                value={minPlayers}
                min={MIN_PLAYERS_LIMIT}
                max={maxPlayers}
                step={1}
                onChange={v => updateSetting('min_players', v)}
              />
              <SettingCard
                icon="🎟️"
                label="Maximum Players"
                description="Room closes to new joins above this"
                value={maxPlayers}
                min={minPlayers}
                max={MAX_PLAYERS_LIMIT}
                step={1}
                onChange={v => updateSetting('max_players', v)}
              />
              <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-3">
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Current players: <span className="text-white font-bold">{players.length}</span> · 
                  Spies allowed: <span className="text-violet-400 font-bold">1 per {Math.floor(players.length / room.spy_count)} players</span>
                </p>
              </div>
            </div>
          )}

          {/* Timers tab */}
          {settingsTab === 'timers' && (
            <div className="space-y-4">
              <TimerSetting
                icon="📝"
                label="Describe Phase"
                description="Time each player has to write their description"
                value={room.describe_seconds}
                min={10}
                max={300}
                onChange={v => updateSetting('describe_seconds', v)}
              />
              <TimerSetting
                icon="💬"
                label="Discussion Phase"
                description="Time to read and discuss all descriptions"
                value={room.discuss_seconds}
                min={15}
                max={600}
                onChange={v => updateSetting('discuss_seconds', v)}
              />
              <TimerSetting
                icon="🗳️"
                label="Voting Phase"
                description="Time to cast votes"
                value={room.vote_seconds}
                min={10}
                max={300}
                onChange={v => updateSetting('vote_seconds', v)}
              />
              <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-3">
                <p className="text-xs text-zinc-500">
                  Total round time: <span className="text-white font-bold">
                    {formatSeconds(room.describe_seconds + room.discuss_seconds + room.vote_seconds)}
                  </span> per round
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button onClick={onClose}
            className="w-full py-3 rounded-2xl font-bold text-white text-sm transition"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
            Save & Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Setting Card ──────────────────────────────────────────────

function SettingCard({ icon, label, description, value, min, max, step, onChange }: {
  icon: string; label: string; description: string
  value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span>{icon}</span>
          <span className="text-sm font-bold text-white">{label}</span>
        </div>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}
          className="w-10 h-10 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 text-white font-bold transition flex items-center justify-center">
          −
        </button>
        <div className="flex-1 text-center">
          <span className="text-2xl font-black text-white font-display tabular-nums">{value}</span>
        </div>
        <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}
          className="w-10 h-10 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 text-white font-bold transition flex items-center justify-center">
          +
        </button>
      </div>
      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${((value - min) / (max - min)) * 100}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)' }} />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  )
}

// ── Timer Setting — free form input + slider ──────────────────

function TimerSetting({ icon, label, description, value, min, max, onChange }: {
  icon: string; label: string; description: string
  value: number; min: number; max: number
  onChange: (v: number) => void
}) {
  const [inputVal, setInputVal] = useState(String(value))

  useEffect(() => { setInputVal(String(value)) }, [value])

  function handleBlur() {
    const n = parseInt(inputVal)
    if (!isNaN(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      onChange(clamped)
      setInputVal(String(clamped))
    } else {
      setInputVal(String(value))
    }
  }

  const quickValues = [15, 30, 45, 60, 90, 120]

  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span>{icon}</span>
          <span className="text-sm font-bold text-white">{label}</span>
        </div>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>

      {/* Free-form input */}
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - 5))} disabled={value <= min}
          className="w-10 h-10 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 text-white font-bold transition flex items-center justify-center text-sm">
          −5
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <input
            type="number"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => e.key === 'Enter' && handleBlur()}
            min={min}
            max={max}
            className="w-20 text-center text-2xl font-black text-white font-display bg-zinc-800 border border-zinc-700 rounded-xl py-1 focus:outline-none focus:border-violet-500 transition tabular-nums"
          />
          <span className="text-sm text-zinc-500 font-medium">sec</span>
        </div>
        <button onClick={() => onChange(Math.min(max, value + 5))} disabled={value >= max}
          className="w-10 h-10 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 text-white font-bold transition flex items-center justify-center text-sm">
          +5
        </button>
      </div>

      {/* Slider */}
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full accent-violet-500 h-1.5 rounded-full cursor-pointer" />

      {/* Quick pick */}
      <div className="flex gap-1.5 flex-wrap">
        {quickValues.filter(v => v >= min && v <= max).map(v => (
          <button key={v} onClick={() => onChange(v)}
            className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition
              ${value === v
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-white'}`}>
            {v}s
          </button>
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600">
        <span>min {min}s</span>
        <span className="text-violet-400 font-medium">{formatSeconds(value)}</span>
        <span>max {formatSeconds(max)}</span>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

function LobbyLoading() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="space-y-2 text-center">
        <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto" />
        <p className="text-zinc-600 text-sm">Loading lobby…</p>
      </div>
    </main>
  )
}