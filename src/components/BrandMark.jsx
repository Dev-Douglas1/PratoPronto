export default function BrandMark({ compact = false, showTagline = true }) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`} aria-label="PratoPronto">
      <div className="brand-symbol" aria-hidden="true">
        <span className="brand-eye" />
        <span className="brand-dot brand-dot--one" />
        <span className="brand-dot brand-dot--two" />
        <span className="brand-dot brand-dot--three" />
      </div>
      <div className="brand-copy">
        <strong><span>Prato</span>Pronto</strong>
        {showTagline && <small>PIZZA • BEBIDA • DELIVERY</small>}
      </div>
    </div>
  )
}
