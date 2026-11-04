import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import useAuth from '../hooks/useAuth.js'
import { useCompany } from '../context/CompanyContext.jsx'

import '../styles/home.css'

// =========================================================
// LISTAS DE FRASES ALEATÓRIAS
// =========================================================
const TITULOS = [
  'Pratos Irresistíveis • Bebidas Geladas • Sobremesas Incríveis',
  'Tudo o que você mais gosta, em um só lugar.',
  'O cardápio perfeito para qualquer momento do seu dia.',
]

const SUBTITULOS = [
  'ENCONTRE A SUA PRÓXIMA REFEIÇÃO',
  'O SEU DELIVERY PREFERIDO',
  'SABORES DA SUA REGIÃO',
]

const FRASES = [
  'Mate sua fome em poucos cliques',
  'Seu próximo pedido está a um toque',
  'Escolha o seu sabor de hoje!',
]

export default function Home() {
  const { user, autenticado, usuario } = useAuth()
  const isUserLoggedIn = Boolean(autenticado || user || usuario)
  const { staffCompanies = [], pilotProfile } = useCompany()

  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isAppInstalled, setIsAppInstalled] = useState(false)
  const [instalando, setInstalando] = useState(false)

  const [textosHero] = useState(() => ({
    titulo: TITULOS[Math.floor(Math.random() * TITULOS.length)],
    subtitulo: SUBTITULOS[Math.floor(Math.random() * SUBTITULOS.length)],
    frase: FRASES[Math.floor(Math.random() * FRASES.length)],
  }))

  useEffect(() => {
    // 1. Verifica se a aplicação já está a correr como PWA instalada
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (isStandalone) {
      setIsAppInstalled(true)
      return
    }

    // 2. Captura o evento nativo de instalação
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsAppInstalled(true)
      setDeferredPrompt(null)
      setInstalando(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  async function handleInstalarApp() {
    setInstalando(true)

    if (!deferredPrompt) {
      setTimeout(() => setInstalando(false), 1800)
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsAppInstalled(true)
      }
      setDeferredPrompt(null)
    } catch {
      // Falha silenciosa
    } finally {
      setInstalando(false)
    }
  }

  return (
    <AppScreen className="home-screen">
      <section className="home-hero" aria-labelledby="home-title">
        <BrandMark />

        <span className="hero-tagline">{textosHero.titulo}</span>
        <p className="eyebrow">{textosHero.subtitulo}</p>
        <h1 id="home-title">{textosHero.frase}</h1>

        <nav className="home-actions" aria-label="Ações principais">
          <Link className="btn btn-primary" to={isUserLoggedIn ? '/pizzas' : '/login'}>
            {isUserLoggedIn ? 'Abrir PratoPronto' : 'Entrar e pedir'}
            <span aria-hidden="true">→</span>
          </Link>

          {!isUserLoggedIn && (
            <Link className="btn btn-outline" to="/cadastro">
              Criar a minha conta
            </Link>
          )}

          {isUserLoggedIn && (
            <Link className="btn btn-outline" to="/empresa/nova">
              Cadastrar uma empresa
            </Link>
          )}

          {staffCompanies.length > 0 && (
            <Link className="btn btn-outline" to="/empresa/pedidos">
              Área da empresa
            </Link>
          )}

          {isUserLoggedIn && pilotProfile && (
            <Link className="btn btn-outline" to="/piloto">
              Área Piloto Parceiro
            </Link>
          )}
        </nav>

        {/* 1. Informação de serviço estática */}
        <div className="subtle-badge" aria-label="Informações de serviço">
          <span>⚡ Lojas locais e entregas diretas na sua região</span>
        </div>

        {/* 2. Crachá de instalação interativo com estado de carregamento */}
        {!isAppInstalled && (
          <button
            type="button"
            className="subtle-badge interactive-badge"
            onClick={handleInstalarApp}
            disabled={instalando}
            style={{ marginTop: '8px' }}
          >
            <span>
              {instalando ? '⏳ A preparar instalação...' : '⚡ Instalar aplicativo'}
            </span>
          </button>
        )}
      </section>

      <footer className="home-footer">
        <nav className="legal-links" aria-label="Informações legais">
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
          <Link to="/termos-de-uso">Termos de Uso</Link>
        </nav>
      </footer>
    </AppScreen>
  )
}