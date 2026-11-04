import React, { useState } from 'react'
import { Link } from 'react-router-dom'

import AppScreen from '../components/AppScreen.jsx'
import BrandMark from '../components/BrandMark.jsx'
import useAuth from '../hooks/useAuth.js'
import { useCompany } from '../context/CompanyContext.jsx'

import '../styles/home.css'
import InstallApp from '../components/InstallApp.jsx'

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
  const isUserLoggedIn = Boolean(autenticado || user)
  const { staffCompanies = [], pilotProfile } = useCompany()


  const [textosHero] = useState(() => ({
    titulo: TITULOS[Math.floor(Math.random() * TITULOS.length)],
    subtitulo: SUBTITULOS[Math.floor(Math.random() * SUBTITULOS.length)],
    frase: FRASES[Math.floor(Math.random() * FRASES.length)],
  }))

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