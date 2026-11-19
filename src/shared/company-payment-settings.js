export const COMPANY_PAYMENT_METHODS = Object.freeze(['pix_manual', 'cash_delivery', 'maquina_entrega'])

const PIX_TYPES = new Set(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'])
const ACCOUNT_TYPES = new Set(['corrente', 'poupanca', 'pagamento'])

export function normalizeCompanyPaymentSettings(input = {}) {
  const methods = [...new Set((Array.isArray(input.methods) ? input.methods : []).filter(value => COMPANY_PAYMENT_METHODS.includes(value)))]
  const pixKeyType = String(input.pixKeyType || '')
  const accountType = String(input.accountType || '')
  return {
    methods,
    pixKeyType: PIX_TYPES.has(pixKeyType) ? pixKeyType : '',
    pixKey: String(input.pixKey || '').trim().slice(0, 120),
    pixHolderName: String(input.pixHolderName || '').trim().slice(0, 120),
    pixHolderDocument: String(input.pixHolderDocument || '').replace(/\D/g, '').slice(0, 14),
    bankName: String(input.bankName || '').trim().slice(0, 80),
    accountType: ACCOUNT_TYPES.has(accountType) ? accountType : '',
    bankBranch: String(input.bankBranch || '').trim().slice(0, 20),
    bankAccount: String(input.bankAccount || '').trim().slice(0, 30),
    bankAccountDigit: String(input.bankAccountDigit || '').trim().slice(0, 5),
    bankHolderName: String(input.bankHolderName || '').trim().slice(0, 120),
    bankHolderDocument: String(input.bankHolderDocument || '').replace(/\D/g, '').slice(0, 14),
  }
}

export function validateCompanyPaymentSettings(input = {}) {
  const value = normalizeCompanyPaymentSettings(input)
  if (!value.methods.length) throw new Error('Selecione pelo menos um meio de pagamento.')
  if (value.methods.includes('pix_manual')) {
    if (!value.pixKey || !PIX_TYPES.has(value.pixKeyType)) throw new Error('Informe a chave Pix e o tipo da chave.')
    if (!value.pixHolderName) throw new Error('Informe o titular da chave Pix.')
    if (![11, 14].includes(value.pixHolderDocument.length)) throw new Error('Informe o CPF ou CNPJ do titular da chave Pix.')
  }
  const bankFields = [value.bankName, value.accountType, value.bankBranch, value.bankAccount, value.bankHolderName, value.bankHolderDocument]
  if (bankFields.some(Boolean) && bankFields.some(field => !field)) throw new Error('Para cadastrar a conta bancária, preencha todos os campos obrigatórios.')
  if (value.bankHolderDocument && ![11, 14].includes(value.bankHolderDocument.length)) throw new Error('O CPF/CNPJ do titular da conta bancária é inválido.')
  return value
}
