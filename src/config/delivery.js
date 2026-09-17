import { normalizarTexto } from '../utils/texto.js'

export const FRETE_GRATIS_ACIMA = 120

const TAXAS_POR_BAIRRO = {
  centro: 5.9,
  'sao joao': 7.9,
}

export function calcularTaxaEntrega(bairro, subtotal) {
  if (!subtotal || subtotal <= 0) return 0
  if (subtotal >= FRETE_GRATIS_ACIMA) return 0
  return TAXAS_POR_BAIRRO[normalizarTexto(bairro)] ?? 9.9
}

export function descricaoTaxaEntrega(bairro) {
  const bairroNormalizado = normalizarTexto(bairro)
  if (TAXAS_POR_BAIRRO[bairroNormalizado] != null) return `Taxa calculada para ${bairro}`
  return 'Taxa padrão para bairros fora das zonas cadastradas'
}
