import React from 'react'

export function Dialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (v: boolean) => void; title?: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="mk-dialog-backdrop" onClick={() => onOpenChange(false)}>
      <div className="mk-dialog" onClick={(e) => e.stopPropagation()}>
        {title ? <h3 style={{ marginTop: 0 }}>{title}</h3> : null}
        {children}
      </div>
    </div>
  )
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{children}</div>
}

