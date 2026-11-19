import { useEffect, useState } from 'react'
import { callServer } from '../../services/server.js'
import { validateCompanyPaymentSettings } from '../../shared/company-payment-settings.js'
import './payment-settings.css'

const empty = {
  methods: ['maquina_entrega'],
  pixKeyType: '', pixKey: '', pixHolderName: '', pixHolderDocument: '',
  bankName: '', accountType: '', bankBranch: '', bankAccount: '', bankAccountDigit: '',
  bankHolderName: '', bankHolderDocument: '',
}

const methodOptions = [
  ['pix_manual', 'Pix direto para a loja', 'O cliente recebe as instruções e a loja confere o pagamento.'],
  ['cash_delivery', 'Dinheiro na entrega', 'O entregador recebe o valor no momento da entrega.'],
  ['maquina_entrega', 'Cartão na entrega', 'A loja ou entregador utiliza a própria maquininha.'],
]

export default function PaymentSettings({ companyId, demo = false }) {
  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(!demo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [provider, setProvider] = useState({ connected: false, status: 'not_configured' })

  useEffect(() => {
    if (demo) { setLoading(false); return }
    let active = true
    callServer('appGetPaymentSettings', { companyId })
      .then(value => {
        if (!active) return
        setForm({ ...empty, ...(value?.settings || {}) })
        setProvider(value?.provider || { connected: false, status: 'not_configured' })
      })
      .catch(err => { if (active) setError(err.message || 'Não foi possível carregar os dados de recebimento.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyId, demo])

  function toggleMethod(id) {
    setForm(current => ({
      ...current,
      methods: current.methods.includes(id) ? current.methods.filter(method => method !== id) : [...current.methods, id],
    }))
  }

  function change(event) {
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const settings = validateCompanyPaymentSettings(form)
      if (!demo) await callServer('appSavePaymentSettings', { companyId, settings })
      setForm(settings)
      setNotice(demo ? 'Prévia: dados não foram enviados ao banco.' : 'Meios de pagamento e dados de recebimento salvos com segurança.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return <section className="company-panel payment-settings">
    <div className="payment-settings__heading">
      <div><h2>Pagamentos e recebimentos</h2><p>Defina como seus clientes podem pagar e informe onde sua empresa recebe.</p></div>
      <span className="payment-settings__status">{provider.connected ? 'Mercado Pago conectado' : 'Conta online não conectada'}</span>
    </div>
    {loading ? <p>Carregando configurações de pagamento…</p> : <form onSubmit={save}>
      <h3>Meios aceitos pela loja</h3>
      <div className="payment-settings__methods">
        {methodOptions.map(([id, title, description]) => <label className="payment-settings__method" key={id}>
          <input type="checkbox" checked={form.methods.includes(id)} onChange={() => toggleMethod(id)} disabled={busy} />
          <span><strong>{title}</strong><small>{description}</small></span>
        </label>)}
      </div>

      {form.methods.includes('pix_manual') && <>
        <h3>Recebimento por Pix</h3>
        <div className="settings-grid">
          <label>Tipo da chave Pix<select name="pixKeyType" value={form.pixKeyType} onChange={change} required><option value="">Selecione</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Chave aleatória</option></select></label>
          <label>Chave Pix<input name="pixKey" value={form.pixKey} onChange={change} maxLength={120} required autoComplete="off" /></label>
          <label>Nome do titular<input name="pixHolderName" value={form.pixHolderName} onChange={change} maxLength={120} required /></label>
          <label>CPF/CNPJ do titular<input name="pixHolderDocument" value={form.pixHolderDocument} onChange={change} inputMode="numeric" maxLength={18} required /></label>
        </div>
        <p className="payment-settings__hint">O cliente fará o Pix diretamente para a loja. A confirmação é manual; não marque o pedido como pago sem conferir o crédito na conta.</p>
      </>}

      <h3>Conta bancária para recebimentos (opcional)</h3>
      <div className="settings-grid">
        <label>Banco<input name="bankName" value={form.bankName} onChange={change} maxLength={80} autoComplete="off" /></label>
        <label>Tipo de conta<select name="accountType" value={form.accountType} onChange={change}><option value="">Selecione</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="pagamento">Pagamento</option></select></label>
        <label>Agência<input name="bankBranch" value={form.bankBranch} onChange={change} maxLength={20} autoComplete="off" /></label>
        <label>Número da conta<input name="bankAccount" value={form.bankAccount} onChange={change} maxLength={30} autoComplete="off" /></label>
        <label>Dígito<input name="bankAccountDigit" value={form.bankAccountDigit} onChange={change} maxLength={5} autoComplete="off" /></label>
        <label>Titular da conta<input name="bankHolderName" value={form.bankHolderName} onChange={change} maxLength={120} /></label>
        <label>CPF/CNPJ do titular<input name="bankHolderDocument" value={form.bankHolderDocument} onChange={change} inputMode="numeric" maxLength={18} /></label>
      </div>
      <p className="payment-settings__hint">Os dados bancários são privados e não aparecem no checkout dos clientes. O cadastro não inicia transferências automáticas.</p>

      <div className="payment-settings__provider">
        <div><h3>Mercado Pago</h3><p>{provider.connected ? 'Conta vinculada. O status de recebimento será validado pelo servidor.' : 'A conexão OAuth permite que a loja autorize o recebimento online sem compartilhar sua senha.'}</p></div>
        <span className="payment-settings__pending">{provider.connected ? 'Conectado' : 'Aguardando credenciais da plataforma'}</span>
        <button type="button" className="company-button secondary" disabled title="A conexão OAuth depende de credenciais da aplicação e da Edge Function no ambiente de prévia.">Conectar Mercado Pago</button>
      </div>
      {error && <p className="company-alert" role="alert">{error}</p>}
      {notice && <p className="company-notice" role="status">{notice}</p>}
      <button type="submit" className="company-button primary" disabled={busy || loading}>{busy ? 'Salvando…' : 'Salvar meios de pagamento'}</button>
    </form>}
  </section>
}
