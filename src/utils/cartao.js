export function formatarNumeroCartao(valor) {
  return valor
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

export function formatarValidade(valor) {
  const numeros = valor.replace(/\D/g, '').slice(0, 4)
  return numeros.length > 2
    ? `${numeros.slice(0, 2)}/${numeros.slice(2)}`
    : numeros
}
