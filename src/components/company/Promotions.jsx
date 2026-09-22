import { useState } from 'react'
import { produtos } from '../../data/produtos.js'
import { promotionStatus, promotionalPrice, validatePromotion } from '../../shared/promotions.js'
import { formatarMoeda as money } from '../../utils/moeda.js'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'

const statusLabels = { ativa: 'No ar', agendada: 'Agendada', pausada: 'Pausada', encerrada: 'Encerrada', sem_oferta: 'Revisar oferta' }
const date = value => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
function localDate(value) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function PromotionForm({ product, offer, available, settings, onSave, onClose, busy, feedback }) {
  const [id, setId] = useState(product.id)
  const [form, setForm] = useState(() => ({ titulo: offer?.titulo || '', percentual: offer?.percentual || 15, inicio: localDate(offer?.inicio || Date.now()), fim: localDate(offer?.fim || Date.now() + 7 * 86400000), ativa: offer?.ativa ?? true }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selected = produtos.find(item => item.id === id)
  const price = settings.find(item => item.id === id)?.preco ?? selected.preco
  const percent = Number(form.percentual)
  const preview = Number.isInteger(percent) && percent >= 1 && percent <= 90 ? Math.max(.01, Math.round(Math.round(price * 100) * (100 - percent) / 100) / 100) : null
  function change(event) {
    const { name, value, type, checked } = event.target
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setError('')
  }
  async function submit(event) {
    event.preventDefault()
    if (busy || saving) return
    try {
      setError('')
      const value = validatePromotion({ ...form, percentual: percent, inicio: new Date(form.inicio).getTime(), fim: new Date(form.fim).getTime() })
      if (value.fim <= Date.now()) throw new Error('Escolha uma data de término no futuro para salvar a oferta.')
      setSaving(true)
      if (await onSave(id, value)) onClose()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }
  return <Modal title={offer ? 'Editar promoção' : 'Criar promoção'} onClose={() => { if (!saving) onClose() }} className="promotion-dialog">
    <form onSubmit={submit} className="promotion-form">
      <label htmlFor="offer-product">Produto</label>
      <select id="offer-product" value={id} disabled={Boolean(offer) || busy || saving} onChange={event => setId(event.target.value)}>{(offer ? [product] : available).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
      <label htmlFor="offer-title">Nome da oferta</label>
      <input id="offer-title" name="titulo" required minLength={3} maxLength={60} value={form.titulo} onChange={change} placeholder="Ex.: Especial da casa" disabled={busy || saving} aria-describedby="offer-title-help" />
      <small id="offer-title-help">Título que o cliente verá · {form.titulo.length}/60</small>
      <label htmlFor="offer-percent">Desconto (%)</label>
      <input id="offer-percent" name="percentual" type="number" inputMode="numeric" min="1" max="90" step="1" required value={form.percentual} onChange={change} disabled={busy || saving} />
      <div className="promotion-date-fields">
        <label htmlFor="offer-start">Começa em<input id="offer-start" name="inicio" type="datetime-local" required value={form.inicio} onChange={change} disabled={busy || saving} /></label>
        <label htmlFor="offer-end">Termina em<input id="offer-end" name="fim" type="datetime-local" required value={form.fim} onChange={change} disabled={busy || saving} /></label>
      </div>
      <small>Até 90 dias. Horário do seu aparelho: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</small>
      <label className="offer-enable"><input type="checkbox" name="ativa" checked={form.ativa} onChange={change} disabled={busy || saving} />Exibir durante o período escolhido</label>
      <div className="offer-preview" aria-label="Prévia da promoção">
        <img src={selected.imagem} alt="" width="80" height="80" />
        <div><span>PRÉVIA · {selected.personalizavel ? 'PIZZA GRANDE' : 'UNIDADE'}</span><h3>{form.titulo || selected.nome}</h3><p><del>{money(price)}</del> <strong>{preview === null ? 'Confira o desconto' : money(preview)}</strong></p></div>
      </div>
      <p className="promotion-help">O desconto vale para o produto e seus opcionais. A taxa de entrega permanece a mesma. Há uma oferta por produto.</p>
      {(error || feedback) && <p className="company-alert" role="alert">{error || feedback}</p>}
      <div className="promotion-form-actions"><button type="button" className="company-button secondary" disabled={saving} onClick={onClose}>Voltar</button><button type="submit" className="company-button primary" disabled={busy || saving}>{saving ? 'Salvando…' : offer ? 'Salvar alterações' : 'Criar promoção'}</button></div>
    </form>
  </Modal>
}

export default function Promotions({ settings, onSave, busy, now, demo, feedback }) {
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('todas')
  const offers = produtos.flatMap(product => {
    const setting = settings.find(item => item.id === product.id)
    return setting?.promocao ? [{ product, setting, status: promotionStatus(setting.promocao, now) }] : []
  })
  const available = produtos.filter(product => !offers.some(item => item.product.id === product.id))
  const filtered = offers.filter(item => filter === 'todas' || item.status === filter)
  const startEdit = item => setEditing(item)
  return <section className="promotions-workspace" aria-label="Ofertas da empresa">
    <div className="promotions-toolbar"><div><h2>Uma boa oferta, na hora certa.</h2><p>Escolha o produto, o desconto e a validade.</p></div><button type="button" className="company-button primary" disabled={busy || !available.length} onClick={() => startEdit({ product: available[0], setting: null })}><Icon name="tag" />Criar promoção</button></div>
    <div className="promotion-summary"><span><strong>{offers.filter(item => item.status === 'ativa').length}</strong> no ar</span><span><strong>{offers.filter(item => item.status === 'agendada').length}</strong> agendadas</span><span><strong>{offers.filter(item => item.status === 'pausada').length}</strong> pausadas</span></div>
    <div className="promotion-filters" role="group" aria-label="Filtrar promoções">{[['todas','Todas'],['ativa','No ar'],['agendada','Agendadas'],['pausada','Pausadas'],['encerrada','Encerradas']].map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {demo && <p className="promotion-help">Teste criar, editar e pausar ofertas. As mudanças desta demonstração são descartadas ao recarregar.</p>}
    <div className="promotion-list">{filtered.map(({ product, setting, status }) => {
      const offer = setting.promocao
      const preview = promotionalPrice(Math.round((setting.preco ?? product.preco) * 100), { ...offer, ativa: true }, offer.inicio)
      return <article className="promotion-card" key={product.id}>
        <div className="promotion-card-heading"><span className={'offer-status offer-' + status}>{statusLabels[status]}</span><b>−{offer.percentual}%</b></div>
        <div className="promotion-product"><img src={product.imagem} alt="" width="96" height="96" /><div><span>{product.nome}{product.personalizavel ? ' · grande' : ''}</span><h3>{offer.titulo}</h3><p><del>{money(setting.preco ?? product.preco)}</del><strong>{money(preview.finalCents / 100)}</strong></p></div></div>
        <p className="promotion-period"><Icon name="clock" size={18} /><span>{date(offer.inicio)} até {date(offer.fim)}</span></p>
        {setting.disponivel === false && <p className="promotion-help">Produto pausado no cardápio. A oferta não permite comprar um item indisponível.</p>}
        <div className="promotion-actions"><button type="button" className="company-button secondary" disabled={busy} onClick={() => startEdit({ product, setting })}>Editar oferta</button><button type="button" className="company-button subtle" disabled={busy || status === 'encerrada'} onClick={() => onSave(product.id, { ...offer, ativa: !offer.ativa })}>{offer.ativa ? 'Pausar' : 'Ativar'}</button></div>
      </article>
    })}</div>
    {!filtered.length && <div className="company-empty"><Icon name="tag" size={30} /><h3>{offers.length ? 'Nenhuma oferta neste filtro' : 'Sua próxima oferta começa aqui'}</h3><p>{offers.length ? 'Escolha outro filtro para ver suas promoções.' : 'Crie uma promoção para destacar um produto no cardápio.'}</p></div>}
    {!available.length && <p className="promotion-help">Todos os produtos já têm uma oferta. Use “Editar oferta” para renovar as datas ou mudar o desconto.</p>}
    {editing && <PromotionForm key={editing.product.id} product={editing.product} offer={editing.setting?.promocao} available={available} settings={settings} onSave={onSave} busy={busy} onClose={() => setEditing(null)} feedback={feedback} />}
  </section>
}
