const DAYS = 7

const digits = value => String(value ?? '').replace(/\D/g, '')
const text = value => String(value ?? '').trim()

export function validateCompanySettings(form) {
  const errors = []
  if (text(form.name).length < 2 || text(form.name).length > 100) errors.push('Informe o nome da empresa (2 a 100 caracteres).')
  if (text(form.legalName).length < 2 || text(form.legalName).length > 160) errors.push('Informe o nome do responsável legal (2 a 160 caracteres).')
  const phone = digits(form.phone)
  if (phone.length < 10 || phone.length > 13) errors.push('Informe um telefone válido com DDD.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(form.privacyEmail))) errors.push('Informe um e-mail de privacidade válido.')

  const address = form.address || {}
  if (text(address.endereco).length < 2) errors.push('Informe a rua ou avenida.')
  if (!text(address.numero)) errors.push('Informe o número do endereço.')
  if (!text(address.bairro)) errors.push('Informe o bairro da empresa.')
  if (digits(address.cep).length !== 8) errors.push('O CEP deve conter 8 números.')
  if (!text(address.cidade) || !/^[A-Z]{2}$/.test(text(address.uf))) errors.push('Informe cidade e UF.')

  if (!Array.isArray(form.hours) || form.hours.length !== DAYS) {
    errors.push('Configure os horários dos sete dias da semana.')
  } else {
    form.hours.forEach((slots, day) => {
      if (!Array.isArray(slots) || slots.length > 3) {
        errors.push('Cada dia pode ter no máximo três intervalos.')
        return
      }
      const sorted = slots.map(slot => ({ start: Number(slot.start), end: Number(slot.end) })).sort((a, b) => a.start - b.start)
      for (let i = 0; i < sorted.length; i++) {
        const { start, end } = sorted[i]
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || start >= end) {
          errors.push('Confira os horários de abertura e fechamento de ' + ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'][day] + '.')
          break
        }
        if (i > 0 && sorted[i - 1].end > start) {
          errors.push('Os intervalos de ' + ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'][day] + ' não podem se sobrepor.')
          break
        }
      }
    })
  }

  if (!Array.isArray(form.zones) || form.zones.length < 1 || form.zones.length > 100) errors.push('Cadastre entre 1 e 100 bairros de atendimento.')
  else {
    const seen = new Set()
    form.zones.forEach(zone => {
      const name = text(zone.bairro)
      const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
      if (name.length < 2 || name.length > 100) errors.push('Cada bairro precisa ter entre 2 e 100 caracteres.')
      if (seen.has(key)) errors.push('Remova bairros duplicados da área de entrega.')
      seen.add(key)
      for (const field of ['fee', 'min']) {
        const value = Number(zone[field])
        if (!Number.isFinite(value) || value < 0 || value > 1000) errors.push('Taxa e pedido mínimo devem estar entre R$ 0 e R$ 1.000,00.')
      }
      if (zone.freeAbove !== '') {
        const value = Number(zone.freeAbove)
        if (!Number.isFinite(value) || value <= 0 || value > 10000) errors.push('O valor para entrega grátis deve ser maior que zero e até R$ 10.000,00.')
      }
    })
  }

  const estimate = Number(form.estimateMinutes)
  const retention = Number(form.retentionDays)
  if (!Number.isInteger(estimate) || estimate < 10 || estimate > 240) errors.push('A previsão de entrega deve ficar entre 10 e 240 minutos.')
  if (!Number.isInteger(retention) || retention < 30 || retention > 3650) errors.push('A retenção operacional deve ficar entre 30 e 3.650 dias.')
  if (!['America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha','America/Cuiaba'].includes(form.timezone)) errors.push('Selecione um fuso horário válido.')

  if (errors.length) throw new Error(errors[0])
  return {
    ...form,
    name: text(form.name),
    legalName: text(form.legalName),
    phone,
    privacyEmail: text(form.privacyEmail).toLowerCase(),
    address: { ...address, endereco: text(address.endereco), numero: text(address.numero), bairro: text(address.bairro), complemento: text(address.complemento), cep: digits(address.cep), cidade: text(address.cidade), uf: text(address.uf).toUpperCase() },
    methods: ['maquina_entrega'],
    zones: form.zones.map(zone => ({
      bairro: text(zone.bairro),
      feeCents: Math.round(Number(zone.fee || 0) * 100),
      minCents: Math.round(Number(zone.min || 0) * 100),
      freeAboveCents: zone.freeAbove === '' ? null : Math.round(Number(zone.freeAbove) * 100),
    })),
  }
}
