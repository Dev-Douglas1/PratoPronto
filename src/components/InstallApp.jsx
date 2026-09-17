import { useEffect, useState } from 'react'
import { clearInstallPrompt, getInstallPrompt, getWaitingWorker, applyAppUpdate } from '../pwa.js'

export default function InstallApp() {
  const [installed, setInstalled] = useState(() => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true))
  const [help, setHelp] = useState('')
  const [update, setUpdate] = useState(Boolean(getWaitingWorker()))
  useEffect(() => {
    const done = () => { setInstalled(true); setHelp('') }
    window.addEventListener('appinstalled', done)
    const ready = () => setUpdate(true)
    window.addEventListener('pratopronto-update-ready', ready)
    return () => { window.removeEventListener('appinstalled', done); window.removeEventListener('pratopronto-update-ready', ready) }
  }, [])
  async function install() {
    const prompt = getInstallPrompt()
    if (prompt) {
      try { await prompt.prompt(); await prompt.userChoice; clearInstallPrompt() }
      catch { clearInstallPrompt(); setHelp('Abra o menu do navegador e procure “Instalar app” ou “Adicionar à tela inicial”.') }
    } else {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      setHelp(ios ? 'Abra este link no Safari. Toque em Compartilhar → Adicionar à Tela de Início.' : 'Abra este link no Chrome do celular. No menu ⋮, escolha “Instalar app” ou “Adicionar à tela inicial”. A opção depende do navegador.')
    }
  }
  if (installed && !update) return null
  return <div className="install-app">{!installed && <button type="button" onClick={install}>↓ Instalar no celular</button>}{help && <p role="status">{help}</p>}{update && <div role="status"><p>Uma atualização está disponível. Conclua seu pedido antes de atualizar.</p><button type="button" onClick={applyAppUpdate}>Atualizar aplicativo</button></div>}</div>
}
