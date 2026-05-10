'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getOrCreateDeviceToken } from '@/lib/player'

export default function HomePage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [isReturning, setIsReturning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check if returning user
  useEffect(() => {
    async function checkReturning() {
      const deviceToken = getOrCreateDeviceToken()
      try {
        const res = await fetch(`/api/users?deviceToken=${deviceToken}`)
        const data = await res.json()
        if (data.user) {
          setNickname(data.user.nickname)
          setIsReturning(true)
        }
      } catch (e) {
        // ignore — new user
      } finally {
        setChecking(false)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    }
    checkReturning()
  }, [])

  async function handleCreate() {
    if (!nickname.trim()) return setError('Pick a nickname first')
    setLoading(true)
    setError('')
    try {
      const deviceToken = getOrCreateDeviceToken()

      // Save/verify guest account
      const userRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const userData = await userRes.json()
      if (!userRes.ok) throw new Error(userData.error || 'Failed to save account')

      // Create room
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create room')
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('deviceToken', deviceToken)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/room/${data.code}/lobby`)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center overflow-hidden px-5">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-fuchsia-600/8 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm animate-fadeIn">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="relative inline-block mb-4">
            <div className="text-7xl select-none">🕵️</div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 rounded-full animate-ping opacity-75" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 rounded-full" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-2 font-display">
            Word<span className="text-violet-400">Spy</span>
          </h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            One traitor. One different word.<br />Find the spy before time runs out.
          </p>
        </div>

        {/* Returning user greeting */}
        {isReturning && !checking && (
          <div className="mb-4 flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl px-4 py-3">
            <span className="text-xl">👋</span>
            <div>
              <p className="text-sm font-bold text-violet-300">Welcome back!</p>
              <p className="text-xs text-zinc-500">Logged in as <span className="text-white font-semibold">{nickname}</span></p>
            </div>
            <button
              onClick={() => { setIsReturning(false); setNickname(''); setTimeout(() => inputRef.current?.focus(), 100) }}
              className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition"
            >
              Change
            </button>
          </div>
        )}

        {/* Card */}
        <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
          {checking ? (
            <div className="flex items-center justify-center py-6 gap-3">
              <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <span className="text-sm text-zinc-500">Checking your account…</span>
            </div>
          ) : (
            <>
              {/* Nickname input */}
              {!isReturning && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                    Your codename
                  </label>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Enter nickname…"
                      value={nickname}
                      onChange={e => { setNickname(e.target.value); setError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                      maxLength={20}
                      className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-600 rounded-2xl px-4 py-3.5 pr-14 text-base focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-600 tabular-nums font-mono">
                      {nickname.length}/20
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <span>⚠️</span><span>{error}</span>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={loading || nickname.trim().length < 2}
                className="w-full py-4 rounded-2xl font-bold text-base text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)' }}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating room…
                    </span>
                  ) : '🚀 Create a Room'}
                </span>
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-600 font-medium">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <button
                onClick={() => router.push('/join')}
                className="w-full py-4 rounded-2xl font-bold text-base text-zinc-300 border border-zinc-700 hover:border-violet-500/50 hover:text-white hover:bg-violet-500/5 transition-all duration-200"
              >
                🔑 Join with a Code
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => setShowRules(!showRules)}
          className="w-full mt-4 text-xs text-zinc-600 hover:text-zinc-400 transition text-center py-2"
        >
          {showRules ? '▲ Hide rules' : '▼ How to play?'}
        </button>

        {showRules && (
          <div className="mt-2 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-2.5 text-sm">
            {[
              ['🎯', 'Civilians', 'Find and eliminate the spy.'],
              ['🕵️', 'The Spy', 'Blend in — your word is slightly different.'],
              ['📝', 'Describe', 'One sentence about your word. Don\'t say it directly.'],
              ['💬', 'Discuss', 'Compare clues. Who sounds suspicious?'],
              ['🗳️', 'Vote', 'Eliminate the most suspicious player each round.'],
            ].map(([icon, title, desc]) => (
              <div key={title} className="flex gap-3">
                <span className="text-base shrink-0">{icon}</span>
                <p className="text-zinc-400 leading-relaxed">
                  <span className="text-zinc-200 font-semibold">{title} — </span>{desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}