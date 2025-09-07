import React from 'react'

export function Select({ children, className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const cls = ['mk-input', className || ''].join(' ').trim()
  return (
    <select {...rest} className={cls}>
      {children}
    </select>
  )
}

