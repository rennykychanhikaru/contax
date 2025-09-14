import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { duration } = await req.json()

  try {
    const { error } = await supabase
      .from('call_logs')
      .insert({ duration })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error logging call:', error)
    return NextResponse.json({ error: 'Failed to log call' }, { status: 500 })
  }
}
