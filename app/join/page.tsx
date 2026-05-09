'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function JoinForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    if (codeFromUrl) setCode(codeFromUrl.toUpperCase())
  }, [searchParams])

  async function handleJoin() {
    if (!nickname.trim()) return setError('Enter a nickname')
    if (code.trim().length < 6) return setError('Enter a valid 6-character room code')
    setLoading(true)
    setError('')
    try {
      const deviceToken = getOrCreateDeviceToken()
      const res = await fetch(`/api/rooms/${code.trim().toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join room')
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('deviceToken', deviceToken)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/room/${code.trim().toUpperCase()}/lobby`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-5xl">🕵️</h1>
          <h2 className="text-2xl font-bold">Join a Room</h2>
          <p className="text-gray-400 text-sm">
            Enter the code your host shared with you
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={20}
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
          />
          <input
            type="text"
            placeholder="Room code (e.g. AB3X9Z)"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            maxLength={6}
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition font-mono tracking-widest text-center text-lg"
          />

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold transition"
          >
            {loading ? 'Joining…' : 'Join Room'}
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full py-3 text-gray-500 hover:text-gray-300 text-sm transition"
          >
            ← Back
          </button>
        </div>
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
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