'use client'

import { useState } from 'react'
import { PromptModal } from '../components/PromptModal'
import { VoiceAgentStyled } from '../components/VoiceAgentStyled'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Settings, MessageSquare } from 'lucide-react'

export default function Page() {
  const [open, setOpen] = useState(false)
  const [openGreeting, setOpenGreeting] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(
    'You are Greg a friendly receptionist. Greet the caller, ask if they want to schedule an appointment, collect a preferred date/time, and confirm. Keep responses concise.'
  )
  const [greeting, setGreeting] = useState('Hi! Thanks for calling. Unfortunately, our offices are now closed. I\'m Greg, the AI receptionist. I\'d be happy to schedule a meeting between you and Renny when he\'s back in the office. What date and time works best for you?')

  return (
    <main className="container max-w-6xl mx-auto p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-3xl">Contax – Voice Scheduling Demo</CardTitle>
          <CardDescription>
            AI-powered voice assistant for seamless calendar management and appointment scheduling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button onClick={() => setOpen(true)} variant="outline" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Edit Agent Prompt
            </Button>
            <Button onClick={() => setOpenGreeting(true)} variant="outline" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Edit Greeting
            </Button>
          </div>
        </CardContent>
      </Card>

      <VoiceAgentStyled systemPrompt={systemPrompt} greeting={greeting} language="en-US" />

      <PromptModal
        open={open}
        initialValue={systemPrompt}
        onClose={() => setOpen(false)}
        onSave={(v) => {
          setSystemPrompt(v)
          setOpen(false)
        }}
      />

      <PromptModal
        open={openGreeting}
        title="Greeting Message"
        initialValue={greeting}
        onClose={() => setOpenGreeting(false)}
        onSave={(v) => {
          setGreeting(v)
          setOpenGreeting(false)
        }}
      />
    </main>
  )
}