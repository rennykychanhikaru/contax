'use client'

import { useState } from 'react'
import { PromptModal } from '../components/PromptModal'
import { VoiceAgent } from '../components/VoiceAgent'

export default function Page() {
  const [open, setOpen] = useState(false)
  const [openGreeting, setOpenGreeting] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(
    'You are Greg a friendly receptionist. Greet the caller, ask if they want to schedule an appointment, collect a preferred date/time, and confirm. Keep responses concise.'
  )
  const [greeting, setGreeting] = useState('Hi! Thanks for calling. Unfortunately, our offices are now closed. I\'m Greg, the AI receptionist. I\'d be happy to schedule a meeting between you and Renny when he\'s back in the office. What date and time works best for you?')

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Contax – Voice Scheduling Demo</h1>

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={() => setOpen(true)}>Edit Agent Prompt</button>
        <button onClick={() => setOpenGreeting(true)}>Edit Greeting</button>
      </div>

      <section style={{ marginTop: 24 }}>
        <VoiceAgent systemPrompt={systemPrompt} greeting={greeting} language="en-US" />
      </section>

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
