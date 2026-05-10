'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getOrCreateDeviceToken } from '@/lib/player'

function JoinForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const nicknameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    if (codeFromUrl) {
      const chars = codeFromUrl.toUpperCase().slice(0, 6).split('')
      setCode([...chars, '', '', '', '', '', ''].slice(0, 6))
    }
    setTimeout(() => nicknameRef.current?.focus(), 300)
  }, [searchParams])

  // Add after the existing useEffect in JoinForm:
  useEffect(() => {
    async function checkReturning() {
      const deviceToken = getOrCreateDeviceToken()
      try {
        const res = await fetch(`/api/users?deviceToken=${deviceToken}`)
        const data = await res.json()
        if (data.user) setNickname(data.user.nickname)
      } catch (e) {
        // ignore
      }
    }
    checkReturning()
  }, [])

  function handleCodeChange(i: number, value: string) {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1)
    const next = [...code]
    next[i] = char
    setCode(next)
    if (char && i < 5) inputRefs.current[i + 1]?.focus()
  }

  function handleCodeKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[i] && i > 0) inputRefs.current[i - 1]?.focus()
    if (e.key === 'Enter') handleJoin()
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setCode([...pasted.split(''), '', '', '', '', ''].slice(0, 6))
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  async function handleJoin() {
    const fullCode = code.join('')
    if (!nickname.trim()) return setError('Enter your nickname')
    if (fullCode.length < 6) return setError('Enter the full 6-character code')
    setLoading(true)
    setError('')
    try {
      const deviceToken = getOrCreateDeviceToken()

      // Save/verify guest account first
      const userRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const userData = await userRes.json()
      if (!userRes.ok) throw new Error(userData.error || 'Failed to save account')

      const res = await fetch(`/api/rooms/${fullCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join')
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('deviceToken', deviceToken)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/room/${fullCode}/lobby`)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  const fullCode = code.join('')

  return (
    <main className="relative min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center overflow-hidden px-5">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm animate-fadeIn">

        <div className="text-center mb-8">
          <div className="text-5xl mb-3 select-none">🔑</div>
          <h2 className="text-3xl font-black text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
            Join Room
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Enter the code your host shared</p>
        </div>

        <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5">

          {/* Nickname */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Your codename</label>
            <div className="relative">
              <input
                ref={nicknameRef}
                type="text"
                placeholder="Enter nickname…"
                value={nickname}
                onChange={e => { setNickname(e.target.value); setError('') }}
                maxLength={20}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-600 rounded-2xl px-4 py-3.5 pr-14 text-base focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-600 font-mono tabular-nums">
                {nickname.length}/20
              </span>
            </div>
          </div>

          {/* OTP Code input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Room code</label>
            <div className="flex gap-2 justify-between">
              {code.map((char, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="text"
                  value={char}
                  onChange={e => handleCodeChange(i, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(i, e)}
                  onPaste={handleCodePaste}
                  maxLength={1}
                  className={`w-12 h-14 text-center text-xl font-black rounded-2xl border transition-all duration-200 bg-zinc-800/80 uppercase outline-none
                    ${char
                      ? 'border-violet-500 text-violet-300 ring-2 ring-violet-500/20'
                      : 'border-zinc-700 text-zinc-400 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/10'
                    }`}
                  style={{ fontFamily: "'Syne', sans-serif" }}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <span>⚠️</span><span>{error}</span>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={loading || nickname.trim().length < 2 || fullCode.length < 6}
            className="w-full py-4 rounded-2xl font-bold text-base text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)' }}
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Joining…
                </span>
              ) : '🚀 Join Room'}
            </span>
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-2xl text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 transition-all"
          >
            ← Back to Home
          </button>
        </div>
      </div>

    </main>
  )
}

export default function JoinPage() {
  return <Suspense><JoinForm /></Suspense>
}