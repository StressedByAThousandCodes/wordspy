'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRules, setShowRules] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleCreate() {
    if (!nickname.trim()) return setError('Enter a nickname first')
    setLoading(true)
    setError('')
    try {
      const deviceToken = getOrCreateDeviceToken()
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="text-6xl select-none">🕵️</div>
          <h1 className="text-3xl font-bold tracking-tight">Who Is The Spy?</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Everyone gets the same word — except the spy.<br />
            Describe it. Discuss. Vote. Find the spy before it&apos;s too late.
          </p>
          <button
            onClick={() => setShowRules(!showRules)}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition"
          >
            {showRules ? 'Hide rules' : 'How to play?'}
          </button>
        </div>

        {/* Rules */}
        {showRules && (
          <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-4 space-y-2 text-sm text-gray-300">
            <p>🎯 <span className="text-white font-medium">Goal:</span> Civilians find the spy. The spy stays hidden.</p>
            <p>📝 <span className="text-white font-medium">Describe:</span> Each player describes their word in one sentence.</p>
            <p>💬 <span className="text-white font-medium">Discuss:</span> Compare descriptions. Who sounds off?</p>
            <p>🗳️ <span className="text-white font-medium">Vote:</span> Eliminate the most suspicious player.</p>
            <p>🏆 <span className="text-white font-medium">Win:</span> Civilians win when all spies are gone. Spies win when they equal or outnumber civilians.</p>
          </div>
        )}

        {/* Form */}
        <div className="space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Your nickname"
              value={nickname}
              onChange={e => {
                setNickname(e.target.value)
                setError('')
              }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition pr-14"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-600 tabular-nums">
              {nickname.length}/20
            </span>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={loading || nickname.trim().length < 2}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition"
          >
            {loading ? 'Creating room…' : 'Create a Room'}
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-gray-600 text-xs">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          <button
            onClick={() => router.push('/join')}
            className="w-full py-3 rounded-xl border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold transition"
          >
            Join with a Code
          </button>
        </div>
      </div>
    </main>
  )
}

function getOrCreateDeviceToken(): string {
  const key = 'spy_device_token'
  let token = localStorage.getItem(key)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(key, token)
  }
  return token
}