import { formatarMoeda as money } from '../../utils/moeda.js'
import { amountToCollect, paymentLabel, paymentStatusLabel, timestampMillis } from '../../utils/pedido.js'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'

export default function PrintTicket({ order, kind, companyName = 'PratoPronto', onClose }) {
  const delivery = kind === 'entrega'
  return <Modal title={'Comanda de ' + (delivery ? 'entrega' : 'cozinha')} onClose={onClose} className="ticket-dialog">
    <p className="muted no-print">Formato 80 mm. No celular, use a impressão do sistema ou salve em PDF.</p>
    <article className="print-ticket">
      <h2>{String(companyName || 'PratoPronto').toUpperCase()}</h2><small>via PRATOPRONTO</small>
      <p>COMANDA DE {delivery ? 'ENTREGA' : 'COZINHA'}<br />DOCUMENTO NÃO FISCAL</p>
      {order.pagamento.ambiente !== 'producao' && <strong className="ticket-demo">TESTE · SEM COBRANÇA REAL</strong>}
      <h3>#{order.id}</h3>
      <p>{new Date(timestampMillis(order.createdAt)).toLocaleString('pt-BR')}</p>
      <hr />
      <strong>{order.cliente.nome}</strong>
      {delivery && <><p>{order.entrega.endereco}, {order.entrega.numero}<br />{order.entrega.bairro}<br />{order.entrega.cidade} / {order.entrega.uf} · {order.entrega.cep}<br />{order.entrega.complemento}</p>{order.cliente.telefone && <p>Telefone: {order.cliente.telefone}</p>}<hr /></>}
      {order.itens.map((item, i) => <div className="ticket-item" key={item.id + i}><strong>{item.quantidade} × {item.nome}</strong>{item.detalhes && <p>{item.detalhes}</p>}{delivery && <p>{money(item.quantidade * item.precoUnitario)}</p>}</div>)}
      {order.observacao && <p><b>Observação:</b> {order.observacao}</p>}
      {delivery && <><hr /><p>Subtotal: {money(order.subtotal)}<br />Entrega: {money(order.taxaEntrega)}<br /><b>Total: {money(order.total)}</b></p><p>{paymentLabel(order.pagamento)}<br />{paymentStatusLabel(order.pagamento)}</p><h3>{amountToCollect(order) > 0 ? 'COBRAR NA ENTREGA: ' + money(amountToCollect(order)) : ['aprovado', 'recebido_entrega', 'aprovado_demo', 'recebido_demo'].includes(order.pagamento.status) ? 'PAGO · NÃO COBRAR NOVAMENTE' : 'CONFERIR STATUS DO PAGAMENTO'}</h3>{order.pagamento.metodo === 'maquina_entrega' && amountToCollect(order) > 0 && <strong>LEVAR A MAQUININHA</strong>}</>}
      <hr /><p>Conferido por: __________________</p>
    </article>
    <button type="button" className="company-button primary no-print" onClick={() => window.print()}><Icon name="print" />Imprimir / salvar PDF</button>
  </Modal>
}
