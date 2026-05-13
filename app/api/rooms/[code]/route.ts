import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  // Always use service client — anon client can fail silently if RLS
  // blocks the read, causing .single() to throw PGRST116 even when the
  // room exists. Service role bypasses RLS entirely.
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', params.code.toUpperCase())
    .maybeSingle()   // returns null instead of error when 0 rows found

  if (error) {
    console.error('Room fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch room' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}