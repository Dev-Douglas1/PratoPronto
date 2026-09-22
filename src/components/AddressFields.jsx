export default function AddressFields({ data, onChange }) {
  function changeCep(event) {
    const value = String(event.target.value || '').replace(/\D/g, '').slice(0, 8)
    onChange({ target: { name: 'cep', value, type: 'text', checked: false } })
  }

  return <>
    <label htmlFor="address-cep">CEP</label>
    <input
      id="address-cep"
      name="cep"
      value={data.cep || ''}
      onChange={changeCep}
      inputMode="numeric"
      autoComplete="postal-code"
      placeholder="00000000"
      pattern="[0-9]{8}"
      maxLength={8}
      aria-describedby="address-cep-help"
      required
    />
    <small className="field-help" id="address-cep-help">Digite os 8 números do CEP.</small>
    <div className="payment-grid">
      <div><label htmlFor="address-city">Cidade</label><input id="address-city" name="cidade" value={data.cidade || ''} onChange={onChange} autoComplete="address-level2" maxLength={100} required /></div>
      <div><label htmlFor="address-state">Estado</label><select id="address-state" name="uf" value={data.uf || ''} onChange={onChange} autoComplete="address-level1" required><option value="">Selecione</option>{['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => <option key={uf}>{uf}</option>)}</select></div>
    </div>
  </>
}
