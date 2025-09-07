import React from 'react'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export function Input(props: InputProps) {
  const { className, ...rest } = props
  const cls = ['mk-input', className || ''].join(' ').trim()
  return <input {...rest} className={cls} />
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className, ...rest } = props
  const cls = ['mk-input', className || ''].join(' ').trim()
  return <textarea {...rest} className={cls} />
}

