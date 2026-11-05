import { Link } from 'react-router-dom'
import AppScreen from '../components/AppScreen.jsx'
import TopBar from '../components/TopBar.jsx'
import BottomNav from '../components/BottomNav.jsx'
import ProductGrid from '../components/ProductGrid.jsx'
import { useFavorites } from '../context/FavoritesContext.jsx'
import './Favoritos.css'

export default function Favoritos() {
  const { favorites } = useFavorites()

  return (
    <AppScreen className="screen-with-nav favorites-page">
      <TopBar titulo="Meus favoritos" voltar={false} />
      <main className="favorites-surface">
        <header className="favorites-heading">
          <span className="favorites-eyebrow">SUA LISTA PESSOAL</span>
          <h1>Produtos favoritos</h1>
          <p>Guarde aqui os pratos, bebidas e sobremesas que deseja encontrar novamente.</p>
        </header>
        {favorites.length ? (
          <>
            <div className="section-heading">
              <h2>Salvos</h2>
              <span>{favorites.length} {favorites.length === 1 ? 'produto' : 'produtos'}</span>
            </div>
            <ProductGrid produtos={favorites} />
          </>
        ) : (
          <section className="favorites-empty" aria-live="polite">
            <span className="favorites-empty__icon" aria-hidden="true">♡</span>
            <h2>Você ainda não tem favoritos</h2>
            <p>Toque no coração de um produto para salvá-lo nesta lista.</p>
            <Link className="btn btn-primary" to="/pratos">Explorar produtos</Link>
          </section>
        )}
      </main>
      <BottomNav />
    </AppScreen>
  )
}
