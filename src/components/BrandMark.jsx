export default function BrandMark({ compact = false, showTagline = true }) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`} aria-label="PratoPronto">
      <img
        className="brand-logo-image"
        src="/images/pratopronto-pac.svg?v=2"
        alt="Símbolo PAC do PratoPronto"
        width="600"
        height="470"
        fetchPriority="high"
      />
      <div className="brand-wordmark" aria-label="PratoPronto">
        <span>Prato</span><strong>Pronto</strong>
      </div>
      {showTagline && <small className="brand-tagline">PIZZA · BEBIDA · DELIVERY</small>}
    </div>
  )
}
