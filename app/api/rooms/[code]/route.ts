import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', params.code.toUpperCase())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }
  return NextResponse.json(data)
}