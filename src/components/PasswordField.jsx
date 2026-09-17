import { useState } from 'react'

export default function PasswordField({ id, ...props }) {
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  function paste(event) {
    const input = event.currentTarget
    const nextLength = input.value.length - ((input.selectionEnd ?? 0) - (input.selectionStart ?? 0)) + event.clipboardData.getData('text').length
    if (props.maxLength && nextLength > props.maxLength) {
      event.preventDefault()
      setError(`A senha ultrapassa o limite de ${props.maxLength} caracteres. O conteúdo não foi colado.`)
    }
  }
  return <div className="password-field">
    <div className="password-field-control">
      <input {...props} id={id} type={visible ? 'text' : 'password'} onPaste={paste} onChange={event => { setError(''); props.onChange?.(event) }} />
      <button type="button" aria-controls={id} aria-pressed={visible} disabled={props.disabled} onClick={() => setVisible(value => !value)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>{visible ? 'Ocultar' : 'Mostrar'}</button>
    </div>
    {error && <small className="password-input-error" role="alert">{error}</small>}
  </div>
}
