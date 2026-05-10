'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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
      const filled = [...chars, '', '', '', '', '', ''].slice(0, 6)
      setCode(filled)
    }
    nicknameRef.current?.focus()
  }, [searchParams])

  function handleCodeChange(index: number, value: string) {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1)
    const newCode = [...code]
    newCode[index] = char
    setCode(newCode)
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter') handleJoin()
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    const newCode = [...pasted.split(''), '', '', '', '', ''].slice(0, 6)
    setCode(newCode)
    const nextEmpty = Math.min(pasted.length, 5)
    inputRefs.current[nextEmpty]?.focus()
  }

  async function handleJoin() {
    const fullCode = code.join('')
    if (!nickname.trim()) return setError('Enter a nickname')
    if (fullCode.length < 6) return setError('Enter the full 6-character room code')
    setLoading(true)
    setError('')
    try {
      const deviceToken = getOrCreateDeviceToken()
      const res = await fetch(`/api/rooms/${fullCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), deviceToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join room')
      sessionStorage.setItem('playerId', data.playerId)
      sessionStorage.setItem('deviceToken', deviceToken)
      sessionStorage.setItem('nickname', nickname.trim())
      router.push(`/room/${fullCode}/lobby`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fullCode = code.join('')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-5xl select-none">🕵️</div>
          <h2 className="text-2xl font-bold">Join a Room</h2>
          <p className="text-gray-400 text-sm">Enter the code your host shared</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <input
              ref={nicknameRef}
              type="text"
              placeholder="Your nickname"
              value={nickname}
              onChange={e => { setNickname(e.target.value); setError('') }}
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition pr-14"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-600 tabular-nums">
              {nickname.length}/20
            </span>
          </div>

          {/* OTP code input */}
          <div>
            <p className="text-xs text-gray-500 mb-2 text-center">Room code</p>
            <div className="flex gap-2 justify-center">
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
                  className={`w-11 h-14 text-center text-xl font-mono font-bold rounded-xl bg-gray-800 border
                    ${char ? 'border-indigo-500 text-white' : 'border-gray-700 text-gray-400'}
                    focus:outline-none focus:border-indigo-400 transition uppercase`}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={loading || nickname.trim().length < 2 || fullCode.length < 6}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition"
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