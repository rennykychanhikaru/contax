'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogActions, Button, Textarea } from '@kit/ui'

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

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())} title={title}>
      <Textarea style={{ minHeight: 160, fontFamily: 'monospace' }} value={value} onChange={(e) => setValue(e.target.value)} />
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave(value)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
