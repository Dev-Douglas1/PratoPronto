import React, { useState } from 'react'

export default function PasswordField({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  maxLength,
  disabled,
}) {
  const [mostrar, setMostrar] = useState(false)

  return (
    <div className="password-field-wrapper">
      <input
        id={id}
        name={name}
        type={mostrar ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => setMostrar((prev) => !prev)}
        disabled={disabled}
        aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {mostrar ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  )
}