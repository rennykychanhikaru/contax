'use client'

import { useEffect, useState } from 'react'

export function PromptModal({
  open,
  initialValue,
  onClose,
  onSave,
  title = 'Agent System Prompt'
}: {
  open: boolean
  initialValue: string
  onClose: () => void
  onSave: (value: string) => void
  title?: string
}) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => setValue(initialValue), [initialValue])

  if (!open) return null
  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <textarea
          style={{ width: '100%', minHeight: 160, fontFamily: 'monospace' }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onSave(value)}>Save</button>
        </div>
      </div>
    </div>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const modal: React.CSSProperties = {
  width: 640,
  maxWidth: '90vw',
  background: 'white',
  padding: 16,
  borderRadius: 8,
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
}
