import { useEffect } from 'react'
import './PilotIntroModal.css'

export default function PilotIntroModal({ open, onClose, onConfirm }) {
  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="pilot-intro-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <section
        className="pilot-intro-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pilot-intro-title"
        aria-describedby="pilot-intro-description"
      >
        <button
          className="pilot-intro-close"
          type="button"
          onClick={onClose}
          aria-label="Fechar apresentação do Piloto Parceiro"
          title="Fechar"
        >
          ×
        </button>

        <div className="pilot-intro-icon" aria-hidden="true">🛵</div>
        <span className="pilot-intro-eyebrow">PILOTO PARCEIRO</span>
        <h2 id="pilot-intro-title">Quer fazer entregas pelo PratoPronto?</h2>

        <p id="pilot-intro-description">
          O Piloto Parceiro recebe ofertas de entrega das empresas cadastradas no PratoPronto.
          Antes de receber pedidos, seu cadastro e seus documentos precisam ser enviados e aprovados.
        </p>

        <div className="pilot-intro-steps">
          <div><b>1</b><span><strong>Complete seus dados</strong><small>Usaremos nome, telefone e cidade já salvos no seu perfil.</small></span></div>
          <div><b>2</b><span><strong>Informe os dados da moto</strong><small>Placa, modelo ou tipo e cor do veículo.</small></span></div>
          <div><b>3</b><span><strong>Envie a documentação</strong><small>Foto do piloto, foto da moto e frente e verso da CNH válida.</small></span></div>
          <div><b>4</b><span><strong>Aguarde a análise</strong><small>As ofertas de entrega só ficam disponíveis depois da aprovação.</small></span></div>
        </div>

        <div className="pilot-intro-warning">
          <strong>Segurança na entrega</strong>
          <p>
            A senha de 4 números do pedido só deve ser solicitada quando você estiver no endereço do cliente.
            Nunca peça essa senha antes da entrega.
          </p>
        </div>

        <p className="pilot-intro-privacy">
          Seus documentos são usados para analisar o cadastro de piloto e ficam em armazenamento privado.
          Você poderá revisar os dados antes de enviar para análise.
        </p>

        <div className="pilot-intro-actions">
          <button className="pilot-intro-secondary" type="button" onClick={onClose}>
            Agora não
          </button>
          <button className="pilot-intro-primary" type="button" onClick={onConfirm} autoFocus>
            Entendi, continuar cadastro
          </button>
        </div>
      </section>
    </div>
  )
}
