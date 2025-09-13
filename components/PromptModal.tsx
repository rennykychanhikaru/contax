'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

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
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Textarea 
            className="min-h-[160px] font-mono" 
            value={value} 
            onChange={(e) => setValue(e.target.value)} 
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(value)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
