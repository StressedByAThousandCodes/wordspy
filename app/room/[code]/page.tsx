'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function RoomEntryPage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  useEffect(() => {
    const playerId = sessionStorage.getItem('playerId')
    if (!playerId) {
      router.replace(`/join?code=${code}`)
      return
    }
    fetch(`/api/rooms/${code}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'playing') {
          router.replace(`/room/${code}/game`)
        } else {
          router.replace(`/room/${code}/lobby`)
        }
      })
      .catch(() => router.replace(`/join?code=${code}`))
  }, [code, router])

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 animate-pulse">Joining room…</p>
    </main>
  )
}