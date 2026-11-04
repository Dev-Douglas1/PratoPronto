export default function BrandMark({ compact = false }) {
  return (
    <div className={`brand-mark brand-mark--icon-only ${compact ? 'brand-mark--compact' : ''}`} aria-label="Símbolo PAC do PratoPronto">
      <img
        className="brand-logo-image"
        src="/images/pratopronto-pac.svg?v=4"
        alt="PAC amarelo do PratoPronto"
        width="600"
        height="550"
        fetchPriority="high"
      />
    </div>
  )
}
