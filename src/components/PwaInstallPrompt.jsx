import { useEffect, useState } from 'react'

const DISMISS_KEY = 'pratopronto:pwa-install-dismissed-at'
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function readDismissedAt() {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) || 0)
  } catch {
    return 0
  }
}

function saveDismissedAt() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // O aviso pode ser dispensado mesmo quando o navegador bloqueia localStorage.
  }
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null)
  const [visible, setVisible] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || isStandalone()) return undefined
    if (!window.matchMedia?.('(max-width: 699px)').matches) return undefined

    const dismissedRecently = Date.now() - readDismissedAt() < DISMISS_FOR_MS
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    setIos(isIos)

    function handleBeforeInstallPrompt(event) {
      event.preventDefault()
      setInstallEvent(event)
      if (!dismissedRecently) setVisible(true)
    }

    function handleInstalled() {
      setVisible(false)
      setInstallEvent(null)
      try {
        window.localStorage.removeItem(DISMISS_KEY)
      } catch {
        // Sem impacto funcional.
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    let iosTimer
    if (isIos && !dismissedRecently) {
      iosTimer = window.setTimeout(() => setVisible(true), 1400)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      if (iosTimer) window.clearTimeout(iosTimer)
    }
  }, [])

  async function instalar() {
    if (!installEvent) return
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice?.outcome === 'accepted') {
        setVisible(false)
        setInstallEvent(null)
      } else {
        dispensar()
      }
    } catch {
      setVisible(false)
    }
  }

  function dispensar() {
    saveDismissedAt()
    setVisible(false)
  }

  if (!visible) return null
  if (!installEvent && !ios) return null

  return (
    <aside className="pwa-install-card" role="dialog" aria-live="polite" aria-label="Instalar PratoPronto">
      <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
      <div className="pwa-install-copy">
        <strong>Use o PratoPronto como app</strong>
        <small>
          {installEvent
            ? 'Instale no celular para abrir em tela cheia e acessar mais rápido.'
            : 'No iPhone/iPad, toque em Compartilhar e depois em “Adicionar à Tela de Início”.'}
        </small>
      </div>
      {installEvent ? <button className="pwa-install-action" type="button" onClick={instalar}>Instalar</button> : null}
      <button className="pwa-install-close" type="button" onClick={dispensar} aria-label="Agora não">×</button>
    </aside>
  )
}
