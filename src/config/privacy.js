import { POLICY_VERSION } from '../../functions/src/policy.js'
export const privacyConfig = {
  appName: 'PratoPronto',
  controllerName: import.meta.env.VITE_CONTROLLER_NAME || 'Responsável pelo PratoPronto',
  privacyEmail: import.meta.env.VITE_PRIVACY_EMAIL || 'CONFIGURE_VITE_PRIVACY_EMAIL',
  policyVersion: POLICY_VERSION,
  retentionOrders: 'Prazo definido pelo controlador conforme obrigações legais, fiscais e necessidade de defesa de direitos.',
}
