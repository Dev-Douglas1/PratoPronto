import { useMemo, useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { formatarMoeda } from '../utils/moeda.js'

const PIZZA_IDS = new Set(['calabresa', 'quatro-queijos', 'estrogonofe', 'frango-catupiry', 'mussarela', 'lombo-canadense'])
const TAMANHOS = [
  { id: 'P', label: 'Pequena', ajuste: -10 },
  { id: 'M', label: 'Média', ajuste: -5 },
  { id: 'G', label: 'Grande', ajuste: 0 },
]
const BORDAS = [
  { id: 'sem', label: 'Sem borda recheada', ajuste: 0 },
  { id: 'catupiry', label: 'Catupiry', ajuste: 8 },
  { id: 'cheddar', label: 'Cheddar', ajuste: 8 },
]
const ADICIONAIS = [
  { id: 'bacon', label: 'Bacon', ajuste: 6 },
  { id: 'catupiry', label: 'Catupiry extra', ajuste: 6 },
  { id: 'cebola', label: 'Cebola', ajuste: 3 },
  { id: 'azeitona', label: 'Azeitona', ajuste: 3 },
]

export default function ProductCard({ produto }) {
  const { adicionar } = useCart()
  const [adicionado, setAdicionado] = useState(false)
  const [modal, setModal] = useState(false)
  const [tamanho, setTamanho] = useState('G')
  const [borda, setBorda] = useState('sem')
  const [adicionais, setAdicionais] = useState([])
  const [observacao, setObservacao] = useState('')
  const isPizza = PIZZA_IDS.has(produto.id)

  const ajuste = useMemo(() => {
    const tamanhoValue = TAMANHOS.find((item) => item.id === tamanho)?.ajuste || 0
    const bordaValue = BORDAS.find((item) => item.id === borda)?.ajuste || 0
    const extrasValue = adicionais.reduce((sum, id) => sum + (ADICIONAIS.find((item) => item.id === id)?.ajuste || 0), 0)
    return tamanhoValue + bordaValue + extrasValue
  }, [tamanho, borda, adicionais])

  function feedback() {
    setAdicionado(true)
    window.setTimeout(() => setAdicionado(false), 900)
  }

  function handleAdd() {
    if (produto.available === false || Number(produto.stock) === 0) return
    if (isPizza) {
      setModal(true)
      return
    }
    adicionar(produto)
    feedback()
  }

  function toggleAdicional(id) {
    setAdicionais((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function confirmarPizza() {
    const tamanhoLabel = TAMANHOS.find((item) => item.id === tamanho)?.label || tamanho
    const bordaLabel = BORDAS.find((item) => item.id === borda)?.label || borda
    const extrasLabels = adicionais.map((id) => ADICIONAIS.find((item) => item.id === id)?.label || id)
    adicionar(produto, {
      tamanho,
      tamanhoLabel,
      borda,
      bordaLabel,
      adicionais,
      extrasLabels,
      observacao: observacao.trim().slice(0, 300),
      ajuste,
    })
    setModal(false)
    feedback()
  }

  const indisponivel = produto.available === false || Number(produto.stock) === 0

  return (
    <>
      <article className={`product-card ${indisponivel ? 'is-unavailable' : ''}`}>
        <div className="product-card__image">
          <img src={produto.imagem} alt={produto.nome} loading="lazy" />
          <span className="product-card__tag">{indisponivel ? 'Indisponível' : 'Feito na hora'}</span>
        </div>
        <div className="product-card-content">
          <h3>{produto.nome}</h3>
          <p>{produto.descricao}</p>
          {Number.isFinite(Number(produto.stock)) && produto.stock > 0 && produto.stock <= 5 ? <small className="stock-warning">Restam {produto.stock}</small> : null}
          <div className="product-card-bottom">
            <div className="product-price">
              <small>A partir de</small>
              <strong>{formatarMoeda(produto.preco)}</strong>
            </div>
            <button type="button" disabled={indisponivel} className={`add-button ${adicionado ? 'is-added' : ''}`} onClick={handleAdd} aria-label={`Adicionar ${produto.nome}`}>
              {indisponivel ? '×' : adicionado ? '✓' : '+'}
            </button>
          </div>
        </div>
      </article>

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(false)}>
          <section className="custom-modal" role="dialog" aria-modal="true" aria-label={`Personalizar ${produto.nome}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="custom-modal__head">
              <div><small>PERSONALIZE</small><h2>{produto.nome}</h2></div>
              <button type="button" className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>

            <fieldset>
              <legend>Tamanho</legend>
              {TAMANHOS.map((item) => (
                <label className="option-row" key={item.id}>
                  <input type="radio" name={`tamanho-${produto.id}`} checked={tamanho === item.id} onChange={() => setTamanho(item.id)} />
                  <span>{item.label}</span><b>{item.ajuste === 0 ? 'base' : `${item.ajuste > 0 ? '+' : ''}${formatarMoeda(item.ajuste)}`}</b>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Borda</legend>
              {BORDAS.map((item) => (
                <label className="option-row" key={item.id}>
                  <input type="radio" name={`borda-${produto.id}`} checked={borda === item.id} onChange={() => setBorda(item.id)} />
                  <span>{item.label}</span><b>{item.ajuste ? `+${formatarMoeda(item.ajuste)}` : 'grátis'}</b>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Adicionais</legend>
              {ADICIONAIS.map((item) => (
                <label className="option-row" key={item.id}>
                  <input type="checkbox" checked={adicionais.includes(item.id)} onChange={() => toggleAdicional(item.id)} />
                  <span>{item.label}</span><b>+{formatarMoeda(item.ajuste)}</b>
                </label>
              ))}
            </fieldset>

            <label className="custom-note">Observação
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Ex.: sem cebola, cortar em 8 pedaços..." />
            </label>
            <button className="btn btn-primary wide-button" type="button" onClick={confirmarPizza}>
              Adicionar • {formatarMoeda(produto.preco + ajuste)}
            </button>
          </section>
        </div>
      )}
    </>
  )
}
