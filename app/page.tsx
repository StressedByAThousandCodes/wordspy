'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getOrCreateDeviceToken } from '@/lib/player'
import { Button, Card, Input, Divider } from '@/components/ui'
import { ThemeToggle } from '@/components/theme'

export default function HomePage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [isReturning, setIsReturning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function checkReturning() {
      try {
        const deviceToken = getOrCreateDeviceToken()
        const res = await fetch(`/api/users?deviceToken=${deviceToken}`)
        const data = await res.json()
        if (data.user) { setNickname(data.user.nickname); setIsReturning(true) }
      } catch { /* new user */ } finally {
        setChecking(false)
        setTimeout(() => inputRef.current?.focus(), 150)
      }
    }
    checkReturning()
  }, [])

  async function handleCreate() {
    if (!nickname.trim()) return setError('Enter a nickname first')
    setLoading(true); setError('')
    try {
      const deviceToken = getOrCreateDeviceToken()
      const userRes = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const userData = await userRes.json()
      if (!userRes.ok) throw new Error(userData.error || 'Failed to save account')
      const res = await fetch('/api/rooms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create room')
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('deviceToken', deviceToken)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/room/${data.code}/lobby`)
    } catch (e: any) { setError(e.message); setLoading(false) }
  }

  const rules = [
    { icon: '📝', step: 'Describe', desc: 'Each player writes one sentence about their word.' },
    { icon: '💬', step: 'Discuss', desc: 'Read all clues. Who sounds off?' },
    { icon: '🗳️', step: 'Vote', desc: 'Eliminate the most suspicious player.' },
    { icon: '🏆', step: 'Win', desc: 'Civilians find all spies. Spies outlast the civilians.' },
  ]

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">

      {/* Theme toggle top right */}
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-xs space-y-6 animate-fadeUp">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl mb-1"
            style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)' }}>
            🕵️
          </div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text)' }}>
            Word<span style={{ color: 'var(--accent)' }}>Spy</span>
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Find the spy before it&apos;s too late.
          </p>
        </div>

        {/* Returning user banner */}
        {isReturning && !checking && (
          <div className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 animate-fadeIn"
            style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent)' }}>
            <span className="text-lg">👋</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>
                Welcome back, <span className="font-bold">{nickname}</span>
              </p>
            </div>
            <button onClick={() => { setIsReturning(false); setNickname(''); setTimeout(() => inputRef.current?.focus(), 100) }}
              className="text-xs shrink-0 transition-opacity hover:opacity-60"
              style={{ color: 'var(--accent-text)' }}>
              Change
            </button>
          </div>
        )}

        {/* Main card */}
        <Card className="p-5 space-y-4">
          {checking ? (
            <div className="flex items-center justify-center py-6 gap-2.5">
              <div className="w-4 h-4 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border-2)', borderTopColor: 'var(--accent)' }} />
              <span className="text-sm" style={{ color: 'var(--text-3)' }}>Checking your account…</span>
            </div>
          ) : (
            <>
              {!isReturning && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-3)' }}>
                    Nickname
                  </label>
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      placeholder="Enter your codename…"
                      value={nickname}
                      onChange={e => { setNickname(e.target.value.slice(0, 20)); setError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                      maxLength={20}
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums"
                      style={{ color: 'var(--text-3)' }}>
                      {nickname.length}/20
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs rounded-xl px-3 py-2" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  {error}
                </p>
              )}

              <Button
                variant="primary"
                size="lg"
                loading={loading}
                disabled={nickname.trim().length < 2}
                onClick={handleCreate}
              >
                Create a Room
              </Button>

              <Divider label="or" />

              <Button
                variant="secondary"
                size="lg"
                onClick={() => router.push('/join')}
              >
                Join with a Code
              </Button>
            </>
          )}
        </Card>

        {/* How to play */}
        <div className="space-y-2">
          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full text-xs font-medium text-center py-1.5 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-3)' }}
          >
            {showRules ? '▲ Hide rules' : '▼ How to play'}
          </button>

          {showRules && (
            <Card className="p-4 space-y-3 animate-fadeUp">
              {rules.map(r => (
                <div key={r.step} className="flex items-start gap-3">
                  <span className="text-base mt-0.5 shrink-0">{r.icon}</span>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{r.step}</p>
                    <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--text-3)' }}>{r.desc}</p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

      </div>
    </main>
  )
}