import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCart } from '../context/CartContext.jsx'
import { tamanhos, bordas, extras } from '../data/produtos.js'
import { productPrice } from '../utils/productPrice.js'
import { formatarMoeda } from '../utils/moeda.js'

export default function ProductCard({ produto, readOnly = false }) {
  const { adicionar } = useCart()
  const [adicionado, setAdicionado] = useState(false)
  const [personalizando, setPersonalizando] = useState(false)
  const [cartError, setCartError] = useState('')
  const modal = useRef(null)
  useEffect(() => {
    const dialog = modal.current
    if (personalizando && dialog) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [personalizando])
  const [tamanho, setTamanho] = useState('grande')
  const [borda, setBorda] = useState('tradicional')
  const [adicionais, setAdicionais] = useState([])

  const tamanhoAtual = tamanhos.find((item) => item.id === tamanho)
  const bordaAtual = bordas.find((item) => item.id === borda)
  const extrasAtuais = extras.filter((item) => adicionais.includes(item.id))
  const customPrice = productPrice(produto, { tamanho, borda, extras: adicionais })
  const precoPersonalizado = customPrice.preco
  const displayPrice = productPrice(produto, produto.personalizavel ? { tamanho: 'pequena' } : {})


  function handleAdd() {
    if (readOnly || produto.disponivel === false) return
    if (produto.personalizavel) {
      setPersonalizando(true)
      return
    }
    try {
      adicionar({ ...produto, preco: displayPrice.preco, precoOriginal: displayPrice.precoOriginal, oferta: displayPrice.oferta })
      setCartError('')
      setAdicionado(true)
      window.setTimeout(() => setAdicionado(false), 900)
    } catch (error) {
      setCartError(error.message || 'Não foi possível adicionar este produto.')
    }
  }

  function alternarAdicional(id) {
    setAdicionais((atuais) => atuais.includes(id)
      ? atuais.filter((item) => item !== id)
      : [...atuais, id])
  }

  function confirmarPersonalizacao() {
    if (readOnly || produto.disponivel === false) { setPersonalizando(false); return }
    const detalhes = [
      tamanhoAtual.nome,
      `borda ${bordaAtual.nome.toLowerCase()}`,
      extrasAtuais.length ? `extras: ${extrasAtuais.map((item) => item.nome).join(', ')}` : '',
    ].filter(Boolean).join(' • ')

    try {
      adicionar({
        ...produto,
        id: `${produto.id}--${tamanho}--${borda}--${[...adicionais].sort().join('.') || 'sem-extra'}`,
        produtoBaseId: produto.id,
        opcoes: { tamanho, borda, extras: [...adicionais].sort() },
        preco: precoPersonalizado,
        detalhes,
      })
      setCartError('')
      setPersonalizando(false)
      setAdicionado(true)
      window.setTimeout(() => setAdicionado(false), 900)
    } catch (error) {
      setCartError(error.message || 'Não foi possível adicionar este produto.')
      setPersonalizando(false)
    }
  }

  return (
    <article className={`product-card ${displayPrice.oferta ? 'has-offer' : ''}`}>
      <div className="product-card__image">
        <img src={produto.imagem} alt={produto.nome} loading="lazy" />
        <span className="product-card__tag">{readOnly ? 'Disponibilidade a confirmar' : produto.disponivel === false ? 'Indisponível' : displayPrice.oferta ? `−${displayPrice.oferta.percentual}%` : produto.personalizavel ? 'Feita na hora' : 'Gelada'}</span>
      </div>
      <div className="product-card-content">
        <h3>{produto.nome}</h3>
        <span className="product-card__company">{produto.companyName || 'PratoPronto'}</span>
        <p>{produto.descricao}</p>
        {displayPrice.oferta && <span className="product-offer-title">{displayPrice.oferta.titulo}</span>}
        <div className="product-card-bottom">
          <div className="product-price">
            <small>{readOnly ? 'Preço de referência' : produto.personalizavel ? 'A partir de' : 'Por unidade'}</small>
            {displayPrice.oferta && <del aria-label="Preço anterior">{formatarMoeda(displayPrice.precoOriginal)}</del>}
            <strong>{formatarMoeda(displayPrice.preco)}</strong>
          </div>
          <button type="button" disabled={readOnly || produto.disponivel === false} className={`add-button ${adicionado ? 'is-added' : ''}`} onClick={handleAdd} aria-label={`Adicionar ${produto.nome}`}>
            {adicionado ? '✓' : '+'}
          </button>
        </div>
      </div>
      {cartError && <p className="form-error" role="alert">{cartError}</p>}
      {personalizando && createPortal(
          <dialog ref={modal} className="customizer-modal" aria-labelledby={`customizer-${produto.id}`} onCancel={() => setPersonalizando(false)}>
            <div className="customizer-header">
              <div><small>PERSONALIZE SUA PIZZA</small><h2 id={`customizer-${produto.id}`}>{produto.nome}</h2></div>
              <button type="button" onClick={() => setPersonalizando(false)} aria-label="Fechar">×</button>
            </div>
            <fieldset className="customizer-options">
              <legend>Tamanho</legend>
              {tamanhos.map((item) => (
                <label key={item.id}><input type="radio" name={`tamanho-${produto.id}`} checked={tamanho === item.id} onChange={() => setTamanho(item.id)} /><span>{item.nome}</span><b>{item.ajuste ? `${item.ajuste > 0 ? '+' : ''}${formatarMoeda(item.ajuste)}` : 'Incluso'}</b></label>
              ))}
            </fieldset>
            <fieldset className="customizer-options">
              <legend>Borda</legend>
              {bordas.map((item) => (
                <label key={item.id}><input type="radio" name={`borda-${produto.id}`} checked={borda === item.id} onChange={() => setBorda(item.id)} /><span>{item.nome}</span><b>{item.ajuste ? `+${formatarMoeda(item.ajuste)}` : 'Incluso'}</b></label>
              ))}
            </fieldset>
            <fieldset className="customizer-options">
              <legend>Adicionais</legend>
              {extras.map((item) => (
                <label key={item.id}><input type="checkbox" checked={adicionais.includes(item.id)} onChange={() => alternarAdicional(item.id)} /><span>{item.nome}</span><b>+{formatarMoeda(item.ajuste)}</b></label>
              ))}
            </fieldset>
            {customPrice.oferta && <p className="customizer-offer">{customPrice.oferta.percentual}% de desconto aplicado ao produto e opcionais. De <del>{formatarMoeda(customPrice.precoOriginal)}</del> por <strong>{formatarMoeda(precoPersonalizado)}</strong>.</p>}
            <button className="btn btn-primary" type="button" disabled={readOnly || produto.disponivel === false} onClick={confirmarPersonalizacao}>Adicionar • {formatarMoeda(precoPersonalizado)}</button>
          </dialog>,
        document.body,
      )}
    </article>
  )
}
