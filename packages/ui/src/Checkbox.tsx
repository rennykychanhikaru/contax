import React from 'react'

export function Checkbox({ checked, onChange, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      {...rest}
      checked={!!checked}
      onChange={onChange}
      className={className}
    />
  )
}

