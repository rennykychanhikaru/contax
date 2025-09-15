import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  // Parse the request body to get agentId if provided
  let agentId: string | undefined
  let requestBody: Record<string, unknown> = {}

  try {
    requestBody = await req.json()
    agentId = requestBody.agentId as string | undefined
  } catch {
    // If body parsing fails, continue without agentId
  }

  // Default voice if not found in agent configuration
  let voice = 'sage'

  // If agentId is provided, fetch the agent's voice configuration
  if (agentId) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options)
              })
            } catch (error) {
              // Handle error
            }
          },
        },
      }
    )

    try {
      const { data: agent } = await supabase
        .from('agent_configurations')
        .select('voice')
        .eq('id', agentId)
        .single()

      if (agent?.voice) {
        voice = agent.voice
      }
    } catch (error) {
      // If we can't fetch the agent, use default voice
      console.error('Failed to fetch agent voice configuration:', error)
    }
  } else {
    // Try to get the default agent for the user's organization
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options)
              })
            } catch (error) {
              // Handle error
            }
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      try {
        // Get user's organization
        const { data: member } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single()

        if (member) {
          // Get the default agent's voice
          const { data: agent } = await supabase
            .from('agent_configurations')
            .select('voice')
            .eq('organization_id', member.organization_id)
            .eq('name', 'default')
            .single()

          if (agent?.voice) {
            voice = agent.voice
          }
        }
      } catch (error) {
        // If we can't fetch the agent, use default voice
        console.error('Failed to fetch default agent voice configuration:', error)
      }
    }
  }

  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      modalities: ['text', 'audio'],
      voice: voice
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    return NextResponse.json({ error: data.error || 'Failed to create session' }, { status: response.status })
  }

  return NextResponse.json(data)
}
