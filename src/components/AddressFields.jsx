export default function AddressFields({ data, onChange }) {
  return <>
    <label htmlFor="address-cep">CEP</label>
    <input id="address-cep" name="cep" value={data.cep || ''} onChange={onChange} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" pattern="[0-9]{5}-?[0-9]{3}" maxLength={9} required />
    <div className="payment-grid">
      <div><label htmlFor="address-city">Cidade</label><input id="address-city" name="cidade" value={data.cidade || ''} onChange={onChange} autoComplete="address-level2" maxLength={100} required /></div>
      <div><label htmlFor="address-state">Estado</label><select id="address-state" name="uf" value={data.uf || ''} onChange={onChange} autoComplete="address-level1" required><option value="">Selecione</option>{['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => <option key={uf}>{uf}</option>)}</select></div>
    </div>
  </>
}
