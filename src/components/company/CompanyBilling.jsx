import { useEffect, useState } from 'react'
import { callServer } from '../../services/server.js'
import { formatarMoeda as money } from '../../utils/moeda.js'
import './company-billing.css'

export default function CompanyBilling({ companyId, restaurantId }) {
  const [subscription, setSubscription] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    if (!companyId) return
    setBusy(true); setError('')
    try { setSubscription(await callServer('appSubscription', { companyId })) }
    catch (err) { setError(err.message || 'Não foi possível consultar a assinatura.') }
    finally { setBusy(false) }
  }

  useEffect(() => { refresh() }, [companyId])

  async function connectAccount(event) {
    event.preventDefault()
    if (!apiKey.trim() || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await callServer('appRegisterAsaasAccount', { restaurantId, apiKey: apiKey.trim() })
      setApiKey('')
      setNotice(response.message || (response.onboardingStatus === 'active' ? 'Conta Asaas conectada.' : 'Conta salva e aguardando aprovação cadastral.'))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function subscribe() {
    if (!acceptTerms || busy) return
    setBusy(true); setError(''); setNotice(''); setResult(null)
    try {
      const response = await callServer('appStartSubscription', {
        restaurantId,
        billingType: 'PIX',
        acceptTerms: true,
        consentTermsVersion: 'pratopronto-subscription-v1',
      })
      setResult(response)
      setNotice(response.note || (response.alreadyActive ? 'Assinatura já está ativa.' : 'Assinatura recorrente criada.'))
      await refresh()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const paid = subscription?.plan?.code === 'profissional' && subscription?.entitled === true
  const currentPayment = result?.currentPayment

  return <div className="company-billing">
    <section className="company-panel billing-plan">
      <div className="billing-plan-heading"><div><span className="billing-eyebrow">PLANO COMERCIAL</span><h2>PratoPronto Profissional</h2></div><strong>{money(49.90)}<small>/ mês</small></strong></div>
      <p>Mensalidade fixa mais comissão de 5% por pedido. O frete não entra na base de cálculo da comissão.</p>
      <ul>
        <li>Cardápio e pedidos da sua empresa</li>
        <li>Gestão de pedidos e acompanhamento</li>
        <li>Entrega realizada pelo próprio restaurante</li>
        <li>Comissão de 5% sobre o subtotal dos produtos</li>
      </ul>
      <div className="billing-current">
        <span>Plano atual</span>
        <strong>{subscription?.plan?.name || 'Consultando…'}</strong>
        <small>{paid ? 'Assinatura paga e ativa' : subscription?.status === 'past_due' ? 'Pagamento pendente — acesso até o fim do período vigente' : 'Plano atual permanece ativo até a confirmação da primeira mensalidade.'}</small>
      </div>
      <button className="company-button secondary" type="button" onClick={refresh} disabled={busy}>{busy ? 'Consultando…' : 'Atualizar situação'}</button>
    </section>

    <section className="company-panel billing-connect">
      <h2>Conta recebedora Asaas</h2>
      <p>Conecte a chave de API da <b>subconta Asaas deste restaurante</b>. A chave será enviada ao backend e armazenada no Supabase Vault; não ficará salva no navegador.</p>
      <p className="billing-warning">A subconta precisa ter sido criada dentro do modelo BaaS previamente aprovado para o PratoPronto. Não use a chave da conta principal da plataforma.</p>
      <form onSubmit={connectAccount}>
        <label>Chave de API da subconta Asaas
          <input type="password" autoComplete="off" spellCheck="false" value={apiKey} onChange={event => setApiKey(event.target.value)} minLength={20} maxLength={500} placeholder="Cole a chave da subconta" />
        </label>
        <button className="company-button primary" type="submit" disabled={busy || apiKey.trim().length < 20}>{busy ? 'Validando…' : 'Validar e guardar no Vault'}</button>
      </form>
    </section>

    <section className="company-panel billing-subscription">
      <h2>Ativar mensalidade recorrente</h2>
      <p>O Asaas emitirá uma cobrança Pix de R$ 49,90 a cada mês. A assinatura só passa ao plano Profissional depois que o primeiro pagamento for confirmado pelo webhook.</p>
      <label className="billing-consent"><input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} />Autorizo a contratação do plano Profissional por R$ 49,90/mês, com renovação mensal via cobrança Pix, e aceito a comissão de 5% sobre os pedidos.</label>
      <button className="company-button primary" type="button" onClick={subscribe} disabled={busy || !acceptTerms || paid}>{busy ? 'Processando…' : paid ? 'Assinatura ativa' : 'Contratar por R$ 49,90/mês'}</button>
      {result?.subscriptionId && <p className="billing-success">Referência da assinatura Asaas: <code>{result.subscriptionId}</code></p>}
      {currentPayment?.pix?.encodedImage && <div className="billing-pix">
        <h3>Primeira mensalidade</h3>
        <img src={'data:image/png;base64,' + currentPayment.pix.encodedImage} alt="QR Code Pix da mensalidade PratoPronto" />
        <label>Pix Copia e Cola<textarea readOnly rows={4} value={currentPayment.pix.payload || ''} /></label>
        <button className="company-button secondary" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(currentPayment.pix.payload); setNotice('Código Pix da mensalidade copiado.') }
          catch { setError('Não foi possível copiar automaticamente. Copie o código manualmente.') }
        }}>Copiar Pix da mensalidade</button>
      </div>}
      {result?.status === 'awaiting_first_payment' && !currentPayment?.pix && <p className="billing-warning">A assinatura foi criada, mas o Asaas ainda não disponibilizou a primeira cobrança Pix. Ela será exibida quando for gerada.</p>}
      <p className="billing-footnote">Importante: nesta versão, a recorrência Pix gera uma nova cobrança mensal que precisa ser paga pelo responsável. Não é débito automático nem Pix Automático. Cartão recorrente será habilitado após integração de tokenização.</p>
    </section>
    {notice && <p className="company-notice" role="status">{notice}</p>}
    {error && <p className="company-alert" role="alert">{error}</p>}
  </div>
}
