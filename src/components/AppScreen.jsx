export default function AppScreen({ children, className = '' }) {
  return (
    <main className="app-shell">
      <section className={`app-screen ${className}`}>{children}</section>
    </main>
  )
}
