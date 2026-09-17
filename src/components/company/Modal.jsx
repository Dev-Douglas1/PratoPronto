import { useEffect, useId, useRef } from 'react'
import Icon from './Icon.jsx'

export default function Modal({ title, children, onClose, className = '' }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { if (dialog.open) dialog.close(); document.body.style.overflow = previousOverflow }
  }, [])
  return <dialog ref={ref} aria-labelledby={titleId} className={'company-dialog ' + className} onCancel={onClose}>
    <header className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Fechar janela" onClick={onClose}><Icon name="close" /></button></header>
    {children}
  </dialog>
}
