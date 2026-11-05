import { normalizeSearch } from '../config/marketplace.js'

export function matchingProducts(products = [], term = '') {
  const needle = normalizeSearch(term)
  return products.filter(product => !needle || [
    product?.nome, product?.descricao, product?.categoria, product?.companyName,
  ].some(value => normalizeSearch(value).includes(needle)))
}

export function matchingCompanies(companies = [], products = [], term = '') {
  const needle = normalizeSearch(term)
  const productCompanyIds = new Set(products.map(product => product.companyId))
  return companies.filter(company => !needle ||
    normalizeSearch(company.name || company.nome).includes(needle) ||
    productCompanyIds.has(company.id || company.slug))
}
