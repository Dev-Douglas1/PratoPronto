export default function BrandMark({ compact = false }) {
  return (
    <div className={`brand-mark brand-mark--icon-only ${compact ? 'brand-mark--compact' : ''}`} aria-label="PratoPronto">
      <img className="brand-logo-image" src="/images/pratopronto-logo.svg" alt="Símbolo amarelo do PratoPronto"
        width="512" height="512" fetchPriority="high" />
    </div>
  )
}
