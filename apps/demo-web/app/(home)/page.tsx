'use client'

import { useState, useEffect } from 'react'
import { VoiceAgentStyled } from '../../components/VoiceAgentStyled'
import { Loader2 } from 'lucide-react'

interface AgentConfig {
  name: string
  display_name?: string
  description?: string
  prompt: string
  greeting: string
  language?: string
  temperature?: number
  max_tokens?: number
}

export default function Page() {
  const [loading, setLoading] = useState(true)
  const [agent, setAgent] = useState<AgentConfig | null>(null)

  useEffect(() => {
    fetchDefaultAgent()
  }, [])

  const fetchDefaultAgent = async () => {
    try {
      const res = await fetch('/api/agents/default')
      if (res.ok) {
        const data = await res.json()
        if (data.agent) {
          setAgent(data.agent)
        }
      }
    } catch (error) {
      console.error('Failed to fetch agent:', error)
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return (
      <main className="container max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </main>
    )
  }

  return (
    <main className="container max-w-6xl mx-auto p-6">
      <VoiceAgentStyled 
        systemPrompt={agent?.prompt || ''} 
        greeting={agent?.greeting || ''} 
        language={agent?.language || "en-US"}
        agentName={agent?.display_name || 'Voice Scheduling Assistant'}
      />
    </main>
  )
}