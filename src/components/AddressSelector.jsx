import React from 'react'

export default function AddressSelector({ enderecoAtual, onClick }) {
  const formatarEndereco = () => {
    if (!enderecoAtual) return 'Selecione um endereço para entrega'
    const rotulo = enderecoAtual.rotulo ? `${enderecoAtual.rotulo} • ` : ''
    const logradouro = enderecoAtual.logradouro || 'Endereço cadastrado'
    const numero = enderecoAtual.numero ? `, ${enderecoAtual.numero}` : ''
    return `${rotulo}${logradouro}${numero}`
  }

  return (
    <button className="address-selector-btn" onClick={onClick} type="button">
      <div className="address-selector-icon" aria-hidden="true">📍</div>
      <div className="address-selector-text">
        <span className="address-selector-label">Entregar em</span>
        <strong className="address-selector-value">{formatarEndereco()}</strong>
      </div>
      <span className="address-selector-arrow" aria-hidden="true">▾</span>
    </button>
  )
}