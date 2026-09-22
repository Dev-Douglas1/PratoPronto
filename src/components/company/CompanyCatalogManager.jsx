import { useEffect, useMemo, useState } from 'react'
import { saveCompanyProduct, subscribeCompanyProducts } from '../../services/marketplace.js'
import { formatarMoeda as money } from '../../utils/moeda.js'

const slug = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

const empty = { id: '', nome: '', descricao: '', categoria: 'Pratos', preco: '', imagem: '', personalizavel: false, disponivel: true }

export default function CompanyCatalogManager({ companyId }) {
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setProducts([]); setError('')
    if (!companyId) return
    return subscribeCompanyProducts(companyId, setProducts, err => setError(err.message || 'Não foi possível carregar o cardápio.'))
  }, [companyId])

  const editing = useMemo(() => products.some(item => item.id === form.id), [products, form.id])

  function edit(product) {
    setForm({
      id: product.id,
      nome: product.nome || '',
      descricao: product.descricao || '',
      categoria: product.categoria || 'Pratos',
      preco: String(product.preco ?? ''),
      imagem: product.imagem || '',
      personalizavel: product.personalizavel === true,
      disponivel: product.disponivel !== false,
    })
    setNotice(''); setError('')
  }

  async function save(event) {
    event.preventDefault()
    const productId = form.id || slug(form.nome)
    if (!productId) { setError('Informe um nome válido para o produto.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      await saveCompanyProduct({ companyId, productId, ...form, id: undefined, preco: Number(form.preco) })
      setForm(empty)
      setNotice(editing ? 'Produto atualizado.' : 'Produto adicionado ao cardápio.')
    } catch (err) { setError(err.message || 'Não foi possível salvar o produto.') }
    finally { setBusy(false) }
  }

  return <div className="company-catalog-manager">
    <section className="company-panel">
      <h2>{editing ? 'Editar produto' : 'Adicionar produto'}</h2>
      <p>Cada empresa mantém seu próprio cardápio. O preço final é conferido no servidor no momento do pedido.</p>
      {error && <p className="company-alert" role="alert">{error}</p>}
      {notice && <p className="company-notice" role="status">{notice}</p>}
      <form className="settings-form" onSubmit={save}>
        <div className="settings-grid">
          <label>Nome<input required maxLength="100" value={form.nome} onChange={e => setForm(v => ({ ...v, nome: e.target.value, id: editing ? v.id : '' }))} /></label>
          <label>Categoria<input required maxLength="40" value={form.categoria} onChange={e => setForm(v => ({ ...v, categoria: e.target.value }))} /></label>
          <label>Preço (R$)<input required type="number" min="0.01" max="1000" step="0.01" value={form.preco} onChange={e => setForm(v => ({ ...v, preco: e.target.value }))} /></label>
          <label>Imagem<input maxLength="500" placeholder="https://... ou /images/..." value={form.imagem} onChange={e => setForm(v => ({ ...v, imagem: e.target.value }))} /></label>
        </div>
        <label>Descrição<textarea maxLength="300" value={form.descricao} onChange={e => setForm(v => ({ ...v, descricao: e.target.value }))} /></label>
        <label className="company-checkbox"><input type="checkbox" checked={form.personalizavel} onChange={e => setForm(v => ({ ...v, personalizavel: e.target.checked }))} />Permitir tamanhos, bordas e adicionais de pizza</label>
        <label className="company-checkbox"><input type="checkbox" checked={form.disponivel} onChange={e => setForm(v => ({ ...v, disponivel: e.target.checked }))} />Produto disponível</label>
        <div className="inline-actions">
          {editing && <button type="button" className="company-button secondary" onClick={() => setForm(empty)}>Cancelar edição</button>}
          <button className="company-button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar produto'}</button>
        </div>
      </form>
    </section>
    <section className="company-catalog">
      {products.map(product => <article className="company-product" key={product.id}>
        {product.imagem ? <img src={product.imagem} alt="" width="100" height="100" loading="lazy" /> : <div className="company-product-placeholder">Sem imagem</div>}
        <div className="company-product-info"><h3>{product.nome}</h3><p>{product.descricao}</p><small>{product.categoria} · {product.disponivel === false ? 'Pausado' : 'Disponível'}</small></div>
        <div><strong>{money(Number(product.preco || 0))}</strong><br /><button type="button" className="company-button subtle" onClick={() => edit(product)}>Editar</button></div>
      </article>)}
      {!products.length && <div className="company-empty"><h3>Cardápio vazio</h3><p>Cadastre o primeiro prato desta empresa.</p></div>}
    </section>
  </div>
}
