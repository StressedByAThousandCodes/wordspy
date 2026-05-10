import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/users?deviceToken=xxx — fetch existing user by device token
export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const deviceToken = req.nextUrl.searchParams.get('deviceToken')
  if (!deviceToken) return NextResponse.json({ user: null })

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('device_token', deviceToken)
    .maybeSingle()

  return NextResponse.json({ user: data ?? null })
}

// POST /api/users — create or update a guest user
export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const { nickname, deviceToken } = await req.json()

  if (!nickname?.trim()) {
    return NextResponse.json({ error: 'Nickname required' }, { status: 400 })
  }
  if (!deviceToken) {
    return NextResponse.json({ error: 'Device token required' }, { status: 400 })
  }

  const cleanNickname = nickname.trim()

  // Check if nickname is taken by a DIFFERENT device
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('nickname', cleanNickname)
    .maybeSingle()

  if (existing && existing.device_token !== deviceToken) {
    return NextResponse.json(
      { error: 'That nickname is already taken — try another one' },
      { status: 409 }
    )
  }

  // Upsert — create or update returning user
  const { data: user, error } = await supabase
    .from('users')
    .upsert(
      {
        nickname: cleanNickname,
        device_token: deviceToken,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'device_token' }
    )
    .select()
    .single()

  if (error || !user) {
    return NextResponse.json({ error: error?.message ?? 'Failed to save user' }, { status: 500 })
  }

  return NextResponse.json({ user })
}