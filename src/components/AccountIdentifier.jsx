import { useRef, useState } from 'react'
import './AccountIdentifier.css'

export default function AccountIdentifier({ accountId, title = 'ID da conta', hint = false }) {
  const value = useRef(null)
  const [feedback, setFeedback] = useState('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(accountId)
      setFeedback('ID copiado.')
    } catch {
      if (value.current) {
        const range = document.createRange()
        range.selectNodeContents(value.current)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
      setFeedback('Selecione e copie o ID acima pelo menu do navegador.')
    }
  }

  if (!accountId) return null

  return <section className="account-identifier" aria-label={title}>
    <div className="account-identifier-heading">
      <strong>{title}</strong>
      <button type="button" onClick={copy} aria-label={`Copiar ID da conta ${accountId}`}>Copiar ID</button>
    </div>
    <code ref={value} tabIndex={0}>{accountId}</code>
    {hint && <p>Compartilhe este ID com o responsável pelo restaurante para receber acesso à equipe. Ele identifica sua conta e permanece o mesmo.</p>}
    <span className="account-identifier-feedback" role="status">{feedback}</span>
  </section>
}
