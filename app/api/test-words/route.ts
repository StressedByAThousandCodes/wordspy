import { NextResponse } from 'next/server'
import { generateWordPair } from '@/lib/words'

export async function GET() {
  try {
    const pair = await generateWordPair()
    return NextResponse.json({ ok: true, pair })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}