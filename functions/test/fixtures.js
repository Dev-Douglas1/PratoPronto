import { validateSettings } from '../src/domain.js'
export const fixedNow = new Date('2026-09-09T22:00:00Z')
export const profile = { nome: 'Cliente Teste', email: 'cliente@example.com', telefone: '41000000000', endereco: 'Rua de Teste', numero: '10', bairro: 'Centro', complemento: '', cidade: 'Cidade Teste', uf: 'PR', cep: '80000000' }
export const settingInput = { name: 'Restaurante de Teste', legalName: 'Responsável de Teste', document: '', phone: '41000000000', privacyEmail: 'privacidade@example.com', address: profile, timezone: 'America/Sao_Paulo', hours: Array.from({ length: 7 }, () => [{ start: 0, end: 1440 }]), zones: [{ bairro: 'Centro', fee: 5, min: 0, freeAbove: 120 }], methods: ['pix','cartao_online','maquina_entrega'], estimateMinutes: 45, retentionDays: 90, acceptingOrders: true }
export const settings = () => validateSettings(structuredClone(settingInput))
export const actor = { uid: 'cliente', email: 'cliente@example.com', email_verified: true }
export const admin = { uid: 'empresa', email: 'empresa@example.com', email_verified: true }
export const config = { environment: 'production', enforceAppCheck: true, liveEnabled: true, hasPaymentSecrets: true, collectorId: '42', origin: 'https://restaurante.example.com' }
export const items = [{ id: 'calabresa', quantidade: 1, opcoes: { tamanho: 'grande', borda: 'tradicional', extras: [] } }]
