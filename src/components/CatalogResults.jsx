import ProductGrid from './ProductGrid.jsx'

export default function CatalogResults({ produtos, loading, error, retry, confirmed }) {
  return <>
    {error && <div className="catalog-notice" role="alert"><p>{error}</p><button className="text-link dark-link" type="button" onClick={retry}>Tentar atualizar</button></div>}
    {loading && <p role="status">Atualizando preços e disponibilidade…</p>}
    <ProductGrid produtos={produtos} readOnly={!confirmed} />
  </>
}
