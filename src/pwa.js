let installPrompt = null
let waitingWorker = null
export function getInstallPrompt() { return installPrompt }
export function clearInstallPrompt() { installPrompt = null }
export function getWaitingWorker() { return waitingWorker }
export function watchForUpdates(registration) {
  function ready() {
    if (registration.waiting && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting
      window.dispatchEvent(new Event('pratopronto-update-ready'))
    }
  }
  ready()
  registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', ready))
}
export function applyAppUpdate() {
  if (!waitingWorker) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waitingWorker.postMessage({ type: 'ACTIVATE_UPDATE' })
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    installPrompt = event
    window.dispatchEvent(new Event('pratopronto-install-ready'))
  })
  window.addEventListener('appinstalled', () => { installPrompt = null })
}
