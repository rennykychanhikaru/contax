import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const contentType = req.headers.get('content-type') || ''
    let payload: Record<string, string> = {}

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text()
      const params = new URLSearchParams(text)
      params.forEach((v, k) => { payload[k] = v })
    } else if (contentType.includes('application/json')) {
      const j = await req.json().catch(() => ({}))
      payload = typeof j === 'object' && j ? j as Record<string, string> : {}
    } else {
      // Try formData as a generic fallback
      try {
        const form = await req.formData()
        form.forEach((v, k) => { if (typeof v === 'string') payload[k] = v })
      } catch {
        // ignore
      }
    }

    const duration = payload['CallDuration'] || payload['Duration'] || '0'
    const callSid = payload['CallSid']
    const callStatus = payload['CallStatus']

    // Insert or update call log minimally
    await supabase
      .from('call_logs')
      .insert({
        call_sid: callSid,
        status: callStatus,
        duration: parseInt(duration || '0', 10) || 0,
        created_at: new Date().toISOString()
      })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error logging call-status:', error)
    // Always return 200 to avoid Twilio retries causing noise
    return NextResponse.json({ success: false }, { status: 200 })
  }
}
