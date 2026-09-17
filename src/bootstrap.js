// Keep this entry independent of React/Firebase so a failed module download
// or initialization can still show an explanation instead of a blank page.
const status = document.getElementById('startup-status')
const retry = document.getElementById('startup-retry')
function explain(message) {
  if (!status?.isConnected) return
  status.textContent = message
  status.setAttribute('role', 'alert')
  if (retry) retry.hidden = false
}
const timer = window.setTimeout(() => explain('A abertura está demorando. Confira sua conexão e tente novamente.'), 12000)
window.addEventListener('pratopronto-ready', () => window.clearTimeout(timer), { once: true })
import('./index.jsx').catch(() => {
  window.clearTimeout(timer)
  explain('Não foi possível carregar o aplicativo. Confira sua conexão e tente novamente.')
})
