import React from 'react'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'default'
}

export function Button({ variant = 'default', className, ...props }: ButtonProps) {
  const cls = ['mk-btn', variant === 'primary' ? 'primary' : '', className || ''].join(' ').trim()
  return <button {...props} className={cls} />
}

