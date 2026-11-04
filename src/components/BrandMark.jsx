export default function BrandMark({ compact = false }) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`} aria-label="PratoPronto">
      <img
        className="brand-logo-image"
        src="/images/pratopronto-brand.jpg"
        alt="PratoPronto"
        width="384"
        height="384"
        fetchPriority="high"
      />
    </div>
  )
}
