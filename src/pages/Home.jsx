import React from 'react'
import { Link } from 'react-router-dom'

import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import useAuth from '../hooks/useAuth.js'
import { useCompany } from '../context/CompanyContext.jsx'

import '../styles/home.css'
import InstallApp from '../components/InstallApp.jsx'

export default function Home() {
  const { user, autenticado } = useAuth()
  const isUserLoggedIn = Boolean(autenticado || user)
  const { staffCompanies = [], pilotProfile } = useCompany()

  return (
    <AppScreen className="home-screen">
      <section className="home-hero" aria-labelledby="home-title">
        <BrandMark />
        <span className="hero-tagline">Pratos, bebidas e sobremesas em um só lugar.</span>
        <p className="eyebrow">DELIVERY LOCAL, SIMPLES E DIRETO</p>
        <h1 id="home-title">Seu próximo pedido começa aqui.</h1>

        <nav className="home-actions" aria-label="Ações principais">
          <Link className="btn btn-primary" to={isUserLoggedIn ? '/pratos' : '/login'}>
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

        {/* Informações de serviço */}
        <div className="subtle-badge" aria-label="Informações de serviço">
          <span>⚡ Lojas locais e entregas diretas na sua região</span>
        </div>

        {/* Instalação PWA compartilhada: prompt nativo ou instruções do navegador. */}
        <InstallApp />
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