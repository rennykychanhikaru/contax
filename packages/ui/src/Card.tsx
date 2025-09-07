import React from 'react'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  const cls = ['mk-card', className || ''].join(' ').trim()
  return <div className={cls}>{children}</div>
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 8, fontWeight: 600 }}>{children}</div>
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

