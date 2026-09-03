export default function AppScreen({ children, className = '' }) {
  return (
    <main className="app-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <section className={`app-screen ${className}`}>{children}</section>
    </main>
  )
}
