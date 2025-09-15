import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const CallRequestSchema = z.object({
  phoneNumber: z.string(),
  agentId: z.string().uuid().optional(),
  context: z.record(z.unknown()).optional()
})

export async function POST(_req: NextRequest) {
  try {
    const body = await req.json()
    const validation = CallRequestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({
        error: 'Invalid request',
        details: validation.error.issues
      }, { status: 400 })
    }

    const { phoneNumber, agentId, context } = validation.data

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('outgoing_calls')
      .insert({
        phone_number: phoneNumber,
        agent_id: agentId,
        context,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create call' }, { status: 500 })
    }

    const result = await supabase.rpc('trigger_outgoing_call', {
      p_phone_number: phoneNumber,
      p_agent_id: agentId,
      p_context: context
    } as Record<string, unknown>)

    if (result.error) {
      console.error('RPC error:', result.error)
      return NextResponse.json({ error: 'Failed to trigger call' }, { status: 500 })
    }

    return NextResponse.json({ success: true, callId: data.id })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
