'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getOrCreateDeviceToken } from '@/lib/player'
import { Button, Card, Input } from '@/components/ui'
import { ThemeToggle } from '@/components/theme'

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
    async function init() {
      // Auto-fill code from URL
      const codeFromUrl = searchParams.get('code')
      if (codeFromUrl) {
        const chars = codeFromUrl.toUpperCase().slice(0, 6).split('')
        setCode([...chars, '', '', '', '', ''].slice(0, 6))
      }
      // Auto-fill nickname from account
      try {
        const deviceToken = getOrCreateDeviceToken()
        const res = await fetch(`/api/users?deviceToken=${deviceToken}`)
        const data = await res.json()
        if (data.user) setNickname(data.user.nickname)
      } catch { /* ignore */ }
      setTimeout(() => nicknameRef.current?.focus(), 150)
    }
    init()
  }, [searchParams])

  function handleCodeChange(i: number, value: string) {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1)
    const next = [...code]; next[i] = char; setCode(next)
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
    if (!nickname.trim()) return setError('Enter a nickname')
    if (fullCode.length < 6) return setError('Enter the full 6-character code')
    setLoading(true); setError('')
    try {
      const deviceToken = getOrCreateDeviceToken()
      const userRes = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const userData = await userRes.json()
      if (!userRes.ok) throw new Error(userData.error || 'Failed to save account')
      const res = await fetch(`/api/rooms/${fullCode}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join')
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('deviceToken', deviceToken)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/room/${fullCode}/lobby`)
    } catch (e: any) { setError(e.message); setLoading(false) }
  }

  const fullCode = code.join('')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="fixed top-4 right-4 z-10"><ThemeToggle /></div>

      <div className="w-full max-w-xs space-y-6 animate-fadeUp">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl mb-1"
            style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)' }}>
            🔑
          </div>
          <h2 className="text-2xl font-display font-bold" style={{ color: 'var(--text)' }}>Join Room</h2>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>Enter the code your host shared</p>
        </div>

        <Card className="p-5 space-y-4">
          {/* Nickname */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Nickname
            </label>
            <div className="relative">
              <Input
                ref={nicknameRef}
                placeholder="Your codename…"
                value={nickname}
                onChange={e => { setNickname(e.target.value.slice(0, 20)); setError('') }}
                maxLength={20}
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums"
                style={{ color: 'var(--text-3)' }}>
                {nickname.length}/20
              </span>
            </div>
          </div>

          {/* OTP code input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Room Code
            </label>
            <div className="flex gap-1.5 justify-between">
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
                  className="flex-1 h-12 text-center text-base font-display font-bold rounded-xl uppercase outline-none transition-all duration-150"
                  style={{
                    background: 'var(--bg-2)',
                    border: `1px solid ${char ? 'var(--accent)' : 'var(--border)'}`,
                    color: char ? 'var(--accent)' : 'var(--text-2)',
                    boxShadow: char ? '0 0 0 3px var(--accent-bg)' : 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-bg)' }}
                  onBlur={e => {
                    if (!char) { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }
                  }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs rounded-xl px-3 py-2" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <Button
            variant="primary"
            size="lg"
            loading={loading}
            disabled={nickname.trim().length < 2 || fullCode.length < 6}
            onClick={handleJoin}
          >
            Join Room
          </Button>

          <Button variant="ghost" size="lg" onClick={() => router.push('/')}>
            ← Back to Home
          </Button>
        </Card>
      </div>
    </main>
  )
}

export default function JoinPage() {
  return <Suspense><JoinForm /></Suspense>
}