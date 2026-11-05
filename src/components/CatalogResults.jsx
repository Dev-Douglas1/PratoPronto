import ProductGrid from './ProductGrid.jsx'

export default function CatalogResults({ produtos = [], loading, error, retry, confirmed }) {
  if (loading) return <p role="status" className="catalog-loading">Carregando cardápio e disponibilidade…</p>

  if (error) {
    return (
      <>
        <div className="catalog-notice" role="alert">
          <p>{error}</p>
          <button className="text-link dark-link" type="button" onClick={retry}>Tentar atualizar</button>
        </div>
        {produtos.length > 0 && <ProductGrid produtos={produtos} readOnly />}
      </>
    )
  }

  return <ProductGrid produtos={produtos} readOnly={!confirmed} />
}
