import useStorefront from '../hooks/useStorefront.js'
export default function StoreInfo() {
  const { store, loading, error } = useStorefront()
  if (loading) return <p className="store-info" role="status">Consultando atendimento…</p>
  if (error) return <p className="store-info" role="status">Não foi possível consultar o atendimento da loja. Você pode conhecer o cardápio enquanto a conexão é restabelecida.</p>
  if (!store?.configured) return <p className="store-info" role="status">A loja está sendo preparada para receber pedidos. Você pode conhecer o cardápio.</p>
  return <aside className="store-info"><strong>{store.open ? 'Aberto para pedidos' : 'Fechado neste horário'}</strong><span>{store.address.cidade} / {store.address.uf}{store.estimateMinutes ? ' · Previsão de ' + store.estimateMinutes + ' min' : ''}</span><small>Bairros: {store.zones.map(zone => zone.bairro).join(', ')}</small>{store.phone && <a href={'tel:' + store.phone.replace(/[^+0-9]/g,'')}>Falar com a empresa</a>}</aside>
}
