import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { makeRedirectUri } from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from './supabase'
import {
  DEFAULT_COMPANY_ID,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  advanceOrder,
  brazilPhone,
  checkoutQuote,
  createQuote,
  loadCatalog,
  loadCompanyOrders,
  loadCompanyCatalog,
  loadMyCompanies,
  loadOrders,
  loadPilotOffers,
  loadPilotOrders,
  loadPilotProfile,
  loadProfile,
  normalizeCep,
  normalizePhone,
  pilotConfirmDelivery,
  pilotStartDelivery,
  profileComplete,
  profileStats,
  respondPilotOffer,
  savePilotProfile,
  saveCompanyProduct,
  setCompanyProductActive,
  saveProfile,
  setPilotAvailability,
  submitPilotApplication,
  uploadPilotDocument,
  validatePassword,
} from './services'

WebBrowser.maybeCompleteAuthSession()

const CART_KEY = 'pratopronto:expo:cart'
const YELLOW = '#FFE317'
const BLACK = '#111111'
const BG = '#F5F5F5'
const MUTED = '#707070'
const BORDER = '#E2E2E2'

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortId = value => String(value || '').slice(-8).toUpperCase()
const orderData = row => ({ ...(row?.data || {}), ...row, pagamento: { ...(row?.data?.pagamento || {}), metodo: row?.payment_method || row?.data?.pagamento?.metodo, status: row?.payment_status || row?.data?.pagamento?.status } })

function friendlyError(error) {
  const text = String(error?.message || error || 'Não foi possível concluir a operação.')
  if (/invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(text)) return 'Confirme seu e-mail antes de entrar.'
  if (/already registered|user already registered/i.test(text)) return 'Este e-mail já possui uma conta.'
  if (/rate limit|too many/i.test(text)) return 'Muitas tentativas. Aguarde um pouco e tente novamente.'
  if (/invalid otp|otp expired|token has expired/i.test(text)) return 'Código inválido ou expirado. Solicite um novo código.'
  if (/network|fetch/i.test(text)) return 'Falha de conexão. Confira sua internet e tente novamente.'
  return text
}

function Button({ children, onPress, variant = 'primary', disabled = false, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        disabled && styles.buttonDisabled,
        pressed && !disabled && { opacity: .78 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextDark]}>{children}</Text>
    </Pressable>
  )
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize = 'sentences', maxLength, multiline = false, editable = true }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea, !editable && styles.inputDisabled]}
        value={String(value ?? '')}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        multiline={multiline}
        editable={editable}
      />
    </View>
  )
}

function Screen({ title, subtitle, children, onBack, refreshing = false, onRefresh, footer = true }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topbar}>
        {onBack ? <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.backSpace} />}
        <View style={styles.brandMini}><View style={styles.pacDot} /><Text style={styles.brandMiniText}>Prato<Text style={{ color: YELLOW }}>Pronto</Text></Text></View>
        <View style={styles.backSpace} />
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, footer && { paddingBottom: 110 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={YELLOW} /> : undefined}
      >
        {title ? <View style={styles.heading}><Text style={styles.eyebrow}>{subtitle || 'PRATOPRONTO'}</Text><Text style={styles.h1}>{title}</Text></View> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>
}

function Notice({ children, error = false }) {
  return <View style={[styles.notice, error && styles.noticeError]}><Text style={[styles.noticeText, error && { color: '#7A1313' }]}>{children}</Text></View>
}

function BottomNav({ screen, navigate, cartCount }) {
  const items = [
    ['home', '⌂', 'Início'],
    ['catalog', '◉', 'Cardápio'],
    ['cart', '▣', cartCount ? `Carrinho ${cartCount}` : 'Carrinho'],
    ['orders', '◎', 'Pedidos'],
    ['profile', '●', 'Perfil'],
  ]
  return (
    <View style={styles.bottomNav}>
      {items.map(([id, icon, label]) => (
        <Pressable key={id} onPress={() => navigate(id)} style={styles.navItem}>
          <Text style={[styles.navIcon, screen === id && styles.navActive]}>{icon}</Text>
          <Text numberOfLines={1} style={[styles.navLabel, screen === id && styles.navActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function PilotIntro({ visible, onClose, onContinue }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>×</Text></Pressable>
          <Text style={styles.modalIcon}>🛵</Text>
          <Text style={styles.eyebrowYellow}>PILOTO PARCEIRO</Text>
          <Text style={styles.modalTitle}>Quer fazer entregas pelo PratoPronto?</Text>
          <Text style={styles.modalText}>O Piloto Parceiro recebe ofertas de entrega das empresas do PratoPronto. Seu cadastro e documentos precisam ser aprovados antes de receber pedidos.</Text>
          {[
            ['1', 'Complete seus dados', 'Nome, telefone e cidade vêm do seu perfil.'],
            ['2', 'Informe os dados da moto', 'Placa, modelo ou tipo e cor.'],
            ['3', 'Envie a documentação', 'Foto do piloto, moto e frente e verso da CNH.'],
            ['4', 'Aguarde a análise', 'As ofertas só aparecem depois da aprovação.'],
          ].map(([n, title, detail]) => (
            <View key={n} style={styles.modalStep}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{n}</Text></View><View style={styles.flex}><Text style={styles.modalStepTitle}>{title}</Text><Text style={styles.modalStepText}>{detail}</Text></View></View>
          ))}
          <Notice>A senha de 4 números do pedido só deve ser pedida quando você estiver no endereço do cliente.</Notice>
          <Button onPress={onContinue}>Entendi, continuar cadastro</Button>
          <Button variant="secondary" onPress={onClose}>Agora não</Button>
        </View>
      </View>
    </Modal>
  )
}

export default function PratoProntoMobile() {
  const [screen, setScreen] = useState('home')
  const [params, setParams] = useState({})
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [booting, setBooting] = useState(true)
  const [busy, setBusy] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [cart, setCart] = useState([])
  const [pilotIntro, setPilotIntro] = useState(false)

  const navigate = useCallback((next, nextParams = {}) => {
    setParams(nextParams)
    setScreen(next)
    setGlobalError('')
  }, [])

  const refreshAccount = useCallback(async (user) => {
    if (!user) {
      setProfile(null)
      return null
    }
    try {
      const account = await loadProfile(user)
      setProfile(account)
      return account
    } catch (error) {
      setGlobalError(friendlyError(error))
      const fallback = { uid: user.id, email: user.email || '', telefone: String(user.phone || '').replace(/^\+55/, ''), nome: user.user_metadata?.nome || user.user_metadata?.full_name || '', emailVerificado: true, admin: false }
      setProfile(fallback)
      return fallback
    }
  }, [])

  useEffect(() => {
    AsyncStorage.getItem(CART_KEY).then(value => {
      try {
        const parsed = JSON.parse(value || '[]')
        if (Array.isArray(parsed)) setCart(parsed)
      } catch {}
    })

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session || null)
      if (data.session?.user) await refreshAccount(data.session.user)
      setBooting(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next || null)
      setTimeout(async () => {
        const account = next?.user ? await refreshAccount(next.user) : null
        if (next?.user && account && ['login','phone','verify','recover'].includes(screen)) {
          navigate(profileComplete(account) ? 'catalog' : 'profile')
        }
      }, 0)
    })

    const onUrl = ({ url }) => consumeAuthUrl(url)
    const linkSub = Linking.addEventListener('url', onUrl)
    Linking.getInitialURL().then(url => { if (url) consumeAuthUrl(url) })

    return () => {
      listener.subscription.unsubscribe()
      linkSub.remove()
    }
  }, [])

  useEffect(() => {
    AsyncStorage.setItem(CART_KEY, JSON.stringify(cart)).catch(() => undefined)
  }, [cart])

  async function consumeAuthUrl(url) {
    try {
      if (!url) return
      const parsed = new URL(url)
      const code = parsed.searchParams.get('code')
      const hash = new URLSearchParams((parsed.hash || '').replace(/^#/, ''))
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) throw error
      }
      if (url.includes('reset-password')) navigate('resetPassword')
    } catch (error) {
      setGlobalError(friendlyError(error))
    }
  }

  async function googleLogin() {
    setBusy(true); setGlobalError('')
    try {
      const redirectTo = makeRedirectUri({ scheme: 'pratopronto', path: 'auth/callback' })
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error) throw error
      const result = await WebBrowser.openAuthSessionAsync(data?.url || '', redirectTo)
      if (result.type === 'success') await consumeAuthUrl(result.url)
      else if (result.type !== 'cancel') throw new Error('O login com Google não foi concluído. Redirect usado: ' + redirectTo)
    } catch (error) {
      setGlobalError(friendlyError(error))
    } finally { setBusy(false) }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
    navigate('home')
  }

  function addToCart(product) {
    setCart(current => {
      const sameCompany = !current.length || current[0].produto.companyId === product.companyId
      if (!sameCompany) {
        Alert.alert('Carrinho de outra loja', 'Finalize ou limpe o carrinho antes de comprar em outra empresa.')
        return current
      }
      const index = current.findIndex(item => item.produto.id === product.id)
      if (index < 0) return [...current, { produto: product, quantidade: 1 }]
      return current.map((item, i) => i === index ? { ...item, quantidade: Math.min(50, item.quantidade + 1) } : item)
    })
  }

  function changeQty(productId, delta) {
    setCart(current => current
      .map(item => item.produto.id === productId ? { ...item, quantidade: item.quantidade + delta } : item)
      .filter(item => item.quantidade > 0))
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantidade, 0)
  const cartSubtotal = cart.reduce((sum, item) => sum + item.quantidade * Number(item.produto.preco || 0), 0)

  if (booting) {
    return <SafeAreaView style={[styles.safe, styles.center, { backgroundColor: BLACK }]}><ActivityIndicator size="large" color={YELLOW} /><Text style={styles.bootText}>Carregando PratoPronto…</Text></SafeAreaView>
  }

  const common = { navigate, busy, setBusy, globalError, setGlobalError, session, profile, setProfile, refreshAccount }
  let content
  if (screen === 'home') content = <HomeScreen {...common} />
  else if (screen === 'login') content = <LoginScreen {...common} googleLogin={googleLogin} />
  else if (screen === 'signup') content = <SignupScreen {...common} setPendingEmail={setPendingEmail} />
  else if (screen === 'verify') content = <VerifyScreen {...common} pendingEmail={pendingEmail} />
  else if (screen === 'phone') content = <PhoneScreen {...common} />
  else if (screen === 'recover') content = <RecoverScreen {...common} />
  else if (screen === 'resetPassword') content = <ResetPasswordScreen {...common} />
  else if (screen === 'catalog') content = <CatalogScreen {...common} addToCart={addToCart} />
  else if (screen === 'cart') content = <CartScreen {...common} cart={cart} changeQty={changeQty} subtotal={cartSubtotal} />
  else if (screen === 'checkout') content = <CheckoutScreen {...common} cart={cart} setCart={setCart} subtotal={cartSubtotal} />
  else if (screen === 'orders') content = <OrdersScreen {...common} />
  else if (screen === 'profile') content = <ProfileScreen {...common} signOut={signOut} setPilotIntro={setPilotIntro} />
  else if (screen === 'pilot') content = <PilotScreen {...common} setPilotIntro={setPilotIntro} />
  else if (screen === 'pilotSignup') content = <PilotSignupScreen {...common} />
  else if (screen === 'company') content = <CompanyScreen {...common} />
  else if (screen === 'legal') content = <LegalScreen {...common} type={params.type} />
  else content = <HomeScreen {...common} />

  const showNav = Boolean(session?.user) && !['login','signup','verify','phone','recover','resetPassword','pilotSignup','legal'].includes(screen)

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {content}
      {globalError ? <View style={styles.globalError}><Text style={styles.globalErrorText}>{globalError}</Text><Pressable onPress={() => setGlobalError('')}><Text style={styles.globalErrorClose}>×</Text></Pressable></View> : null}
      {showNav ? <BottomNav screen={screen} navigate={navigate} cartCount={cartCount} /> : null}
      <PilotIntro
        visible={pilotIntro}
        onClose={() => setPilotIntro(false)}
        onContinue={() => { setPilotIntro(false); navigate('pilotSignup') }}
      />
    </KeyboardAvoidingView>
  )
}

function HomeScreen({ navigate, session, profile }) {
  return (
    <Screen footer={false}>
      <View style={styles.hero}>
        <View style={styles.logoBig}><View style={styles.logoMouth} /></View>
        <Text style={styles.heroTitle}>Prato<Text style={{ color: YELLOW }}>Pronto</Text></Text>
        <Text style={styles.heroText}>Pedido simples, acompanhamento claro e experiência feita para celular.</Text>
        <Button onPress={() => navigate('catalog')}>Ver cardápio</Button>
        {!session?.user ? <Button variant="secondary" onPress={() => navigate('login')}>Entrar ou criar conta</Button> : <Button variant="secondary" onPress={() => navigate(profileComplete(profile) ? 'profile' : 'profile')}>Minha conta</Button>}
      </View>
      <View style={styles.homeFeatures}>
        {[
          ['⚡', 'Pedido rápido', 'Escolha seus produtos e acompanhe o pedido pelo celular.'],
          ['🔒', 'Conta protegida', 'Supabase Auth, verificação de e-mail e políticas RLS.'],
          ['🛵', 'Piloto Parceiro', 'Cadastro, análise e ofertas de entrega no mesmo app.'],
        ].map(([icon,title,text]) => <Card key={title}><Text style={styles.featureIcon}>{icon}</Text><Text style={styles.cardTitle}>{title}</Text><Text style={styles.muted}>{text}</Text></Card>)}
      </View>
    </Screen>
  )
}

function LoginScreen({ navigate, busy, setBusy, setGlobalError, googleLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function submit() {
    if (busy) return
    setBusy(true); setGlobalError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw error
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }

  return <Screen title="Entrar" subtitle="SUA CONTA" onBack={() => navigate('home')} footer={false}>
    <Card>
      <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" />
      <Field label="Senha" value={password} onChangeText={setPassword} placeholder="Sua senha" secureTextEntry autoCapitalize="none" maxLength={12} />
      <Button onPress={submit} disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      <Button variant="secondary" onPress={googleLogin} disabled={busy}>Continuar com Google</Button>
      <Button variant="secondary" onPress={() => navigate('phone')}>Entrar com telefone</Button>
      <Pressable onPress={() => navigate('recover')}><Text style={styles.link}>Esqueci minha senha</Text></Pressable>
      <Pressable onPress={() => navigate('signup')}><Text style={styles.link}>Criar uma conta</Text></Pressable>
    </Card>
  </Screen>
}

function SignupScreen({ navigate, busy, setBusy, setGlobalError, setPendingEmail }) {
  const [form, setForm] = useState({ nome:'', email:'', telefone:'', senha:'', cep:'', cidade:'', uf:'PR', endereco:'', numero:'', bairro:'', complemento:'' })
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function submit() {
    if (busy) return
    setBusy(true); setGlobalError('')
    try {
      validatePassword(form.senha)
      if (form.nome.trim().length < 2) throw new Error('Informe seu nome.')
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) throw new Error('Informe um e-mail válido.')
      brazilPhone(form.telefone)
      if (normalizeCep(form.cep).length !== 8) throw new Error('Informe um CEP com 8 números.')
      if (!form.cidade.trim() || !form.endereco.trim() || !form.numero.trim() || !form.bairro.trim()) throw new Error('Complete seu endereço de entrega.')
      if (!acceptPrivacy || !acceptTerms) throw new Error('Aceite a Política de Privacidade e os Termos de Uso.')

      const email = form.email.trim().toLowerCase()
      const metadata = {
        nome: form.nome.trim(),
        telefone: normalizePhone(form.telefone),
        cep: normalizeCep(form.cep),
        cidade: form.cidade.trim(),
        uf: form.uf.trim().toUpperCase(),
        endereco: form.endereco.trim(),
        numero: form.numero.trim(),
        bairro: form.bairro.trim(),
        complemento: form.complemento.trim(),
        privacy_policy_version: PRIVACY_POLICY_VERSION,
        terms_version: TERMS_VERSION,
        consent_timestamp: new Date().toISOString(),
      }
      const { data, error } = await supabase.auth.signUp({ email, password: form.senha, options: { data: metadata } })
      if (error) throw error
      if (data.session) {
        navigate('profile')
      } else {
        setPendingEmail(email)
        navigate('verify')
      }
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }

  return <Screen title="Criar conta" subtitle="CADASTRO" onBack={() => navigate('login')} footer={false}>
    <Card>
      <Field label="Nome" value={form.nome} onChangeText={v => set('nome', v)} placeholder="Seu nome" />
      <Field label="E-mail" value={form.email} onChangeText={v => set('email', v)} placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" />
      <Field label="Telefone com DDD" value={form.telefone} onChangeText={v => set('telefone', normalizePhone(v))} placeholder="41999999999" keyboardType="phone-pad" maxLength={11} />
      <Field label="Senha" value={form.senha} onChangeText={v => set('senha', v)} placeholder="6 a 12 caracteres" secureTextEntry autoCapitalize="none" maxLength={12} />
      <Text style={styles.help}>Use minúscula, maiúscula e número. Símbolo é opcional.</Text>
      <Field label="CEP" value={form.cep} onChangeText={v => set('cep', normalizeCep(v))} placeholder="00000000" keyboardType="number-pad" maxLength={8} />
      <View style={styles.row}><View style={styles.flex}><Field label="Cidade" value={form.cidade} onChangeText={v => set('cidade', v)} /></View><View style={styles.ufBox}><Field label="UF" value={form.uf} onChangeText={v => set('uf', v.toUpperCase().slice(0,2))} maxLength={2} autoCapitalize="characters" /></View></View>
      <Field label="Rua" value={form.endereco} onChangeText={v => set('endereco', v)} />
      <View style={styles.row}><View style={styles.flex}><Field label="Bairro" value={form.bairro} onChangeText={v => set('bairro', v)} /></View><View style={styles.numberBox}><Field label="Número" value={form.numero} onChangeText={v => set('numero', v)} /></View></View>
      <Field label="Complemento" value={form.complemento} onChangeText={v => set('complemento', v)} />
      <CheckLine value={acceptPrivacy} onChange={setAcceptPrivacy} label="Li e aceito a Política de Privacidade." />
      <CheckLine value={acceptTerms} onChange={setAcceptTerms} label="Li e aceito os Termos de Uso." />
      <Button onPress={submit} disabled={busy}>{busy ? 'Criando conta…' : 'Cadastrar'}</Button>
    </Card>
  </Screen>
}

function VerifyScreen({ navigate, pendingEmail, busy, setBusy, setGlobalError }) {
  const [email, setEmail] = useState(pendingEmail || '')
  const [code, setCode] = useState('')

  async function verify() {
    if (busy) return
    setBusy(true); setGlobalError('')
    try {
      if (!/^\d{6}$/.test(code)) throw new Error('Digite os 6 números enviados por e-mail.')
      const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' })
      if (error) throw error
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }

  async function resend() {
    setBusy(true); setGlobalError('')
    try {
      const { error } = await supabase.auth.resend({ type:'signup', email: email.trim().toLowerCase() })
      if (error) throw error
      Alert.alert('Código reenviado', 'Confira sua caixa de entrada e também o spam.')
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }

  return <Screen title="Confirme seu e-mail" subtitle="CÓDIGO DE 6 DÍGITOS" onBack={() => navigate('login')} footer={false}>
    <Card>
      <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Código" value={code} onChangeText={v => setCode(v.replace(/\D/g,'').slice(0,6))} placeholder="000000" keyboardType="number-pad" maxLength={6} />
      <Button onPress={verify} disabled={busy || code.length !== 6}>{busy ? 'Confirmando…' : 'Confirmar código'}</Button>
      <Button variant="secondary" onPress={resend} disabled={busy}>Reenviar código</Button>
    </Card>
  </Screen>
}

function PhoneScreen({ navigate, busy, setBusy, setGlobalError }) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)

  async function send() {
    setBusy(true); setGlobalError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: brazilPhone(phone) })
      if (error) throw error
      setSent(true)
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }

  async function verify() {
    setBusy(true); setGlobalError('')
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: brazilPhone(phone), token: code, type:'sms' })
      if (error) throw error
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }

  return <Screen title="Entrar com telefone" subtitle="SMS" onBack={() => navigate('login')} footer={false}>
    <Card>
      <Field label="Telefone com DDD" value={phone} onChangeText={v => setPhone(normalizePhone(v))} placeholder="41999999999" keyboardType="phone-pad" maxLength={11} editable={!sent} />
      {sent ? <Field label="Código SMS" value={code} onChangeText={v => setCode(v.replace(/\D/g,'').slice(0,6))} placeholder="000000" keyboardType="number-pad" maxLength={6} /> : null}
      <Button onPress={sent ? verify : send} disabled={busy || (sent && code.length !== 6)}>{busy ? 'Aguarde…' : sent ? 'Confirmar e entrar' : 'Enviar código'}</Button>
      {sent ? <Button variant="secondary" onPress={() => { setSent(false); setCode('') }}>Trocar telefone</Button> : null}
    </Card>
  </Screen>
}

function RecoverScreen({ navigate, busy, setBusy, setGlobalError }) {
  const [email, setEmail] = useState('')
  async function submit() {
    setBusy(true); setGlobalError('')
    try {
      const redirectTo = makeRedirectUri({ scheme:'pratopronto', path:'reset-password' })
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
      if (error) throw error
      Alert.alert('E-mail enviado', 'Abra o link de recuperação no mesmo aparelho. Se estiver no Expo Go, autorize o redirect gerado no Supabase.')
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }
  return <Screen title="Recuperar senha" subtitle="ACESSO" onBack={() => navigate('login')} footer={false}>
    <Card><Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /><Button onPress={submit} disabled={busy}>{busy ? 'Enviando…' : 'Enviar link seguro'}</Button></Card>
  </Screen>
}

function ResetPasswordScreen({ navigate, busy, setBusy, setGlobalError }) {
  const [password, setPassword] = useState('')
  async function submit() {
    setBusy(true); setGlobalError('')
    try {
      validatePassword(password)
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      await supabase.auth.signOut()
      Alert.alert('Senha alterada', 'Entre novamente com sua nova senha.')
      navigate('login')
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }
  return <Screen title="Nova senha" subtitle="RECUPERAÇÃO" footer={false}><Card><Field label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" maxLength={12} /><Text style={styles.help}>6 a 12 caracteres, com minúscula, maiúscula e número.</Text><Button onPress={submit} disabled={busy}>Salvar nova senha</Button></Card></Screen>
}

function CatalogScreen({ navigate, addToCart }) {
  const [products, setProducts] = useState([])
  const [store, setStore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('Todos')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const value = await loadCatalog(DEFAULT_COMPANY_ID)
      setProducts(value.products)
      setStore(value.store)
    } catch (e) { setError(friendlyError(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.categoria).filter(Boolean)))]
  const visible = filter === 'Todos' ? products : products.filter(p => p.categoria === filter)

  return <Screen title={store?.name || 'Cardápio'} subtitle={store?.open ? 'ABERTO PARA PEDIDOS' : 'CARDÁPIO'} refreshing={loading} onRefresh={load}>
    {error ? <Notice error>{error}</Notice> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {categories.map(cat => <Pressable key={cat} onPress={() => setFilter(cat)} style={[styles.chip, filter === cat && styles.chipActive]}><Text style={[styles.chipText, filter === cat && styles.chipTextActive]}>{cat}</Text></Pressable>)}
    </ScrollView>
    {loading && !products.length ? <ActivityIndicator color={BLACK} /> : null}
    {visible.map(product => <ProductCard key={product.id} product={product} add={() => addToCart(product)} />)}
    {!visible.length && !loading ? <Card><Text style={styles.cardTitle}>Nenhum produto disponível</Text><Text style={styles.muted}>Puxe a tela para atualizar o cardápio.</Text></Card> : null}
  </Screen>
}

function ProductCard({ product, add }) {
  return <Card style={styles.productCard}>
    <View style={styles.productImage}><Text style={styles.productEmoji}>{product.categoria?.toLowerCase().includes('beb') ? '🥤' : '🍕'}</Text></View>
    <View style={styles.productInfo}>
      <Text style={styles.cardTitle}>{product.nome}</Text>
      <Text style={styles.muted} numberOfLines={2}>{product.descricao}</Text>
      <View style={styles.productBottom}><Text style={styles.price}>{money(product.preco)}</Text><Pressable onPress={add} style={styles.addButton}><Text style={styles.addButtonText}>+</Text></Pressable></View>
    </View>
  </Card>
}

function CartScreen({ navigate, cart, changeQty, subtotal, session, profile }) {
  if (!cart.length) return <Screen title="Carrinho" subtitle="SEU PEDIDO"><Card><Text style={styles.cardTitle}>Seu carrinho está vazio</Text><Text style={styles.muted}>Adicione produtos do cardápio para começar.</Text><Button onPress={() => navigate('catalog')}>Ver cardápio</Button></Card></Screen>
  return <Screen title="Carrinho" subtitle="REVISE SEU PEDIDO">
    {cart.map(item => <Card key={item.produto.id} style={styles.cartItem}><View style={styles.flex}><Text style={styles.cardTitle}>{item.produto.nome}</Text><Text style={styles.muted}>{money(item.produto.preco)} cada</Text></View><View style={styles.qty}><Pressable onPress={() => changeQty(item.produto.id,-1)} style={styles.qtyButton}><Text>−</Text></Pressable><Text style={styles.qtyText}>{item.quantidade}</Text><Pressable onPress={() => changeQty(item.produto.id,1)} style={styles.qtyButton}><Text>+</Text></Pressable></View></Card>)}
    <Card><View style={styles.totalLine}><Text style={styles.cardTitle}>Subtotal</Text><Text style={styles.totalValue}>{money(subtotal)}</Text></View><Button onPress={() => {
      if (!session?.user) navigate('login')
      else if (!profileComplete(profile)) navigate('profile')
      else navigate('checkout')
    }}>Continuar para pagamento</Button></Card>
  </Screen>
}

function CheckoutScreen({ navigate, cart, setCart, subtotal, profile, busy, setBusy, setGlobalError }) {
  const [method, setMethod] = useState('maquina_entrega')
  const [note, setNote] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [quote, setQuote] = useState(null)

  async function submit() {
    setBusy(true); setGlobalError('')
    try {
      if (!profileComplete(profile)) throw new Error('Complete seu perfil e endereço antes de finalizar.')
      if (!acceptTerms) throw new Error('Aceite os termos deste pedido.')
      if (!quote) {
        const value = await createQuote({ companyId: cart[0]?.produto?.companyId || DEFAULT_COMPANY_ID, items: cart, method, note, acceptTerms })
        setQuote(value)
        return
      }
      const requestId = Crypto.randomUUID()
      const result = await checkoutQuote(quote.quoteId, requestId)
      setCart([])
      await AsyncStorage.removeItem(CART_KEY)
      Alert.alert('Pedido criado', 'Pedido #' + shortId(result.orderId) + ' enviado ao restaurante.')
      navigate('orders')
    } catch (error) { setGlobalError(friendlyError(error)); setQuote(null) }
    finally { setBusy(false) }
  }

  const methods = [
    ['maquina_entrega','Máquina na entrega'],
    ['pix','Pix'],
    ['cartao_online','Cartão online'],
  ]

  return <Screen title={quote ? 'Confira os valores' : 'Pagamento'} subtitle="FINALIZAR PEDIDO" onBack={() => navigate('cart')}>
    <Card>
      <Text style={styles.cardTitle}>Forma de pagamento</Text>
      {methods.map(([id,label]) => <Pressable key={id} onPress={() => { setMethod(id); setQuote(null) }} style={[styles.option, method === id && styles.optionSelected]}><Text style={styles.optionText}>{label}</Text><Text>{method === id ? '✓' : ''}</Text></Pressable>)}
      <Field label="Observação (opcional)" value={note} onChangeText={v => { setNote(v); setQuote(null) }} multiline maxLength={500} placeholder="Ex.: tocar o interfone." />
      <Notice>Entrega em {profile?.endereco}, {profile?.numero} · {profile?.bairro} · {profile?.cidade}/{profile?.uf}</Notice>
      {quote ? <View style={styles.quoteBox}>
        <Text style={styles.cardTitle}>Resumo confirmado</Text>
        {(quote.itens || []).map(item => <View key={item.id} style={styles.totalLine}><Text style={styles.flexText}>{item.quantidade} × {item.nome}</Text><Text>{money(item.quantidade * item.precoUnitario)}</Text></View>)}
        <View style={styles.totalLine}><Text>Entrega</Text><Text>{quote.taxaEntrega === 0 ? 'Grátis' : money(quote.taxaEntrega)}</Text></View>
        <View style={styles.totalLine}><Text style={styles.cardTitle}>Total</Text><Text style={styles.totalValue}>{money(quote.total)}</Text></View>
      </View> : <View style={styles.totalLine}><Text style={styles.cardTitle}>Subtotal atual</Text><Text style={styles.totalValue}>{money(subtotal)}</Text></View>}
      <CheckLine value={acceptTerms} onChange={v => { setAcceptTerms(v); setQuote(null) }} label="Li e aceito os Termos de Uso e a Política de Privacidade deste pedido." />
      <Button onPress={submit} disabled={busy}>{busy ? 'Aguarde…' : quote ? 'Confirmar pedido' : 'Conferir valores e entrega'}</Button>
    </Card>
  </Screen>
}

function OrdersScreen({ profile }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!profile?.uid) return
    setLoading(true); setError('')
    try { setOrders(await loadOrders(profile.uid)) } catch (e) { setError(friendlyError(e)) } finally { setLoading(false) }
  }, [profile?.uid])
  useEffect(() => { load() }, [load])

  return <Screen title="Meus pedidos" subtitle="ACOMPANHAMENTO" refreshing={loading} onRefresh={load}>
    {error ? <Notice error>{error}</Notice> : null}
    {orders.map(row => {
      const order = orderData(row)
      return <Card key={row.id}><View style={styles.totalLine}><Text style={styles.cardTitle}>#{shortId(row.id)}</Text><Text style={styles.statusPill}>{row.status || 'novo'}</Text></View><Text style={styles.muted}>{new Date(row.created_at).toLocaleString('pt-BR')}</Text><Text style={styles.orderTotal}>{money(order.total)}</Text></Card>
    })}
    {!orders.length && !loading ? <Card><Text style={styles.cardTitle}>Nenhum pedido ainda</Text><Text style={styles.muted}>Quando você finalizar uma compra, ela aparecerá aqui.</Text></Card> : null}
  </Screen>
}

function ProfileScreen({ navigate, session, profile, setProfile, refreshAccount, busy, setBusy, setGlobalError, signOut, setPilotIntro }) {
  const [editing, setEditing] = useState(!profileComplete(profile))
  const [form, setForm] = useState(profile || {})
  const [stats, setStats] = useState(null)
  useEffect(() => { setForm(profile || {}) }, [profile])
  useEffect(() => { if (profile?.uid) profileStats(profile.uid).then(setStats).catch(() => setStats(null)) }, [profile?.uid])
  const set = (key,value) => setForm(current => ({ ...current, [key]:value }))

  async function save() {
    setBusy(true); setGlobalError('')
    try {
      if (!form.nome?.trim()) throw new Error('Informe seu nome.')
      brazilPhone(form.telefone)
      if (normalizeCep(form.cep).length !== 8) throw new Error('Informe um CEP com 8 números.')
      if (!form.endereco?.trim() || !form.numero?.trim() || !form.bairro?.trim() || !form.cidade?.trim() || !form.uf?.trim()) throw new Error('Complete o endereço de entrega.')
      const saved = await saveProfile(profile.uid, { ...form, email: profile.email, consentTimestamp: profile.consentTimestamp })
      const account = await refreshAccount(session.user)
      setProfile({ ...saved, ...account })
      setEditing(false)
    } catch (error) { setGlobalError(friendlyError(error)) }
    finally { setBusy(false) }
  }

  if (editing) return <Screen title="Editar perfil" subtitle="MINHA CONTA" onBack={() => profileComplete(profile) ? setEditing(false) : navigate('home')}>
    <Card>
      <Field label="Nome" value={form.nome} onChangeText={v => set('nome',v)} />
      <Field label="E-mail" value={profile?.email || 'Conta por telefone'} editable={false} />
      <Field label="Telefone" value={form.telefone} onChangeText={v => set('telefone',normalizePhone(v))} keyboardType="phone-pad" maxLength={11} />
      <Field label="CEP" value={form.cep} onChangeText={v => set('cep',normalizeCep(v))} keyboardType="number-pad" maxLength={8} />
      <View style={styles.row}><View style={styles.flex}><Field label="Cidade" value={form.cidade} onChangeText={v => set('cidade',v)} /></View><View style={styles.ufBox}><Field label="UF" value={form.uf} onChangeText={v => set('uf',v.toUpperCase().slice(0,2))} maxLength={2} /></View></View>
      <Field label="Rua" value={form.endereco} onChangeText={v => set('endereco',v)} />
      <View style={styles.row}><View style={styles.flex}><Field label="Bairro" value={form.bairro} onChangeText={v => set('bairro',v)} /></View><View style={styles.numberBox}><Field label="Número" value={form.numero} onChangeText={v => set('numero',v)} /></View></View>
      <Field label="Complemento" value={form.complemento} onChangeText={v => set('complemento',v)} />
      <CheckLine value={Boolean(form.aceitarMarketing)} onChange={v => set('aceitarMarketing',v)} label="Receber promoções." />
      <Text style={styles.help}>Ao salvar, você confirma a Política de Privacidade {PRIVACY_POLICY_VERSION} e os Termos {TERMS_VERSION}.</Text>
      <Button onPress={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar perfil'}</Button>
    </Card>
  </Screen>

  return <Screen title={profile?.nome || 'Minha conta'} subtitle={profile?.cidade ? profile.cidade + (profile.uf ? '/' + profile.uf : '') : 'CONTA VERIFICADA'}>
    <Card style={styles.profileCard}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.nome || profile?.email || 'PP').slice(0,2).toUpperCase()}</Text></View>
      <Text style={styles.profileName}>{profile?.nome}</Text>
      <Text style={styles.muted}>{profile?.email || profile?.telefone}</Text>
      <Text selectable style={styles.accountId}>ID: {profile?.uid}</Text>
      <View style={styles.statsRow}>
        <Stat value={stats?.orders ?? '—'} label="Pedidos" />
        <Stat value={stats?.delivered ?? '—'} label="Entregues" />
        <Stat value={stats?.reviews ?? '—'} label="Avaliações" />
      </View>
    </Card>
    <Button onPress={() => setEditing(true)}>Editar perfil e endereço</Button>
    {profile?.admin ? <Button variant="secondary" onPress={() => navigate('company')}>Área da empresa</Button> : null}
    <Button variant="secondary" onPress={() => { setPilotIntro(true) }}>Área de Piloto Parceiro</Button>
    <Button variant="secondary" onPress={() => navigate('legal',{type:'privacy'})}>Privacidade e dados</Button>
    <Button variant="ghost" onPress={signOut}>Sair da conta</Button>
  </Screen>
}

function Stat({ value, label }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
}

function PilotScreen({ navigate, profile, setPilotIntro, setGlobalError }) {
  const [pilot, setPilot] = useState(null)
  const [offers, setOffers] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [codes, setCodes] = useState({})

  const load = useCallback(async () => {
    if (!profile?.uid) return
    setLoading(true)
    try {
      const p = await loadPilotProfile()
      setPilot(p)
      if (p?.approval_status === 'approved') {
        const [o, jobs] = await Promise.all([loadPilotOffers(profile.uid), loadPilotOrders(profile.uid)])
        setOffers(o); setOrders(jobs)
      } else { setOffers([]); setOrders([]) }
    } catch (e) { setGlobalError(friendlyError(e)) }
    finally { setLoading(false) }
  }, [profile?.uid])
  useEffect(() => { load() }, [load])

  if (!pilot || pilot.approval_status === 'draft') return <Screen title="Piloto Parceiro" subtitle="ENTREGAS PARCEIRAS" refreshing={loading} onRefresh={load}>
    <Card><Text style={styles.cardTitle}>Cadastro incompleto</Text><Text style={styles.muted}>Conheça a área e envie a documentação para análise.</Text><Button onPress={() => setPilotIntro(true)}>Começar cadastro</Button></Card>
  </Screen>

  if (pilot.approval_status === 'pending') return <Screen title="Piloto Parceiro" subtitle="EM ANÁLISE" refreshing={loading} onRefresh={load}><Card><Text style={styles.cardTitle}>Cadastro em análise</Text><Text style={styles.muted}>As ofertas serão liberadas após a aprovação.</Text></Card></Screen>
  if (pilot.approval_status === 'rejected') return <Screen title="Piloto Parceiro" subtitle="CORREÇÃO NECESSÁRIA"><Card><Text style={styles.cardTitle}>Revise seu cadastro</Text><Text style={styles.muted}>{pilot.rejection_reason || 'Revise os documentos enviados.'}</Text><Button onPress={() => navigate('pilotSignup')}>Corrigir e reenviar</Button></Card></Screen>

  async function availability(value) {
    try { await setPilotAvailability(value); await load() } catch (e) { setGlobalError(friendlyError(e)) }
  }

  async function offer(id, accept) {
    try { await respondPilotOffer(id, accept); await load() } catch (e) { setGlobalError(friendlyError(e)) }
  }

  async function start(orderId) {
    try { await pilotStartDelivery(orderId); await load() } catch (e) { setGlobalError(friendlyError(e)) }
  }

  async function confirm(orderId) {
    const code = codes[orderId] || ''
    if (!/^\d{4}$/.test(code)) return setGlobalError('Digite a senha de entrega de 4 números.')
    try { await pilotConfirmDelivery(orderId, code, true); await load() } catch (e) { setGlobalError(friendlyError(e)) }
  }

  return <Screen title="Piloto Parceiro" subtitle="CADASTRO APROVADO" refreshing={loading} onRefresh={load}>
    <Card><View style={styles.totalLine}><View><Text style={styles.cardTitle}>Receber ofertas</Text><Text style={styles.muted}>{pilot.motorcycle_type || 'Moto'} · {pilot.vehicle_plate || '—'}</Text></View><Switch value={pilot.accepting_offers === true} onValueChange={availability} trackColor={{ true:YELLOW }} /></View></Card>
    <Text style={styles.sectionTitle}>Ofertas de entrega</Text>
    {offers.filter(o => o.status === 'pending').map(o => <Card key={o.id}><Text style={styles.cardTitle}>Pedido #{shortId(o.order?.id)}</Text><Text style={styles.muted}>{o.order?.data?.entrega?.bairro || 'Entrega disponível'}</Text><View style={styles.row}><Button variant="secondary" style={styles.flex} onPress={() => offer(o.id,false)}>Recusar</Button><Button style={styles.flex} onPress={() => offer(o.id,true)}>Aceitar</Button></View></Card>)}
    <Text style={styles.sectionTitle}>Minhas entregas</Text>
    {orders.filter(o => !['entregue','cancelado'].includes(o.status)).map(o => <Card key={o.id}><Text style={styles.cardTitle}>#{shortId(o.id)} · {o.status}</Text><Text style={styles.muted}>{o.data?.entrega?.endereco}, {o.data?.entrega?.numero} · {o.data?.entrega?.bairro}</Text>{o.status === 'pronto' ? <Button onPress={() => start(o.id)}>Iniciar entrega</Button> : null}{o.status === 'saiu_entrega' ? <><Field label="Senha de entrega" value={codes[o.id] || ''} onChangeText={v => setCodes(c => ({...c,[o.id]:v.replace(/\D/g,'').slice(0,4)}))} keyboardType="number-pad" maxLength={4} /><Button onPress={() => confirm(o.id)}>Confirmar entrega</Button></> : null}</Card>)}
  </Screen>
}

function PilotSignupScreen({ navigate, profile, busy, setBusy, setGlobalError }) {
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [motorcycleType, setMotorcycleType] = useState('')
  const [vehicleColor, setVehicleColor] = useState('')
  const [cnhCategory, setCnhCategory] = useState('A')
  const [cnhExpiry, setCnhExpiry] = useState('')
  const [files, setFiles] = useState({})
  const [consent, setConsent] = useState(false)
  const [progress, setProgress] = useState('')

  async function pickImage(kind) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para selecionar o documento.')
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], quality:.85 })
    if (!result.canceled && result.assets?.[0]) setFiles(current => ({ ...current, [kind]: result.assets[0] }))
  }

  async function pickDocument(kind) {
    const result = await DocumentPicker.getDocumentAsync({ type:['image/*','application/pdf'], copyToCacheDirectory:true, multiple:false })
    if (!result.canceled && result.assets?.[0]) setFiles(current => ({ ...current, [kind]: result.assets[0] }))
  }

  async function submit() {
    setBusy(true); setGlobalError('')
    try {
      if (!profileComplete(profile)) throw new Error('Complete seu perfil antes do cadastro de piloto.')
      const plate = vehiclePlate.toUpperCase().replace(/[^A-Z0-9]/g,'')
      if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) throw new Error('Informe uma placa válida, como ABC1D23.')
      if (motorcycleType.trim().length < 2 || vehicleColor.trim().length < 2) throw new Error('Informe modelo e cor da moto.')
      if (!cnhExpiry) throw new Error('Informe a validade da CNH.')
      if (!files.profile || !files.motorcycle || !files['cnh-front'] || !files['cnh-back']) throw new Error('Selecione todas as fotos e documentos.')
      if (!consent) throw new Error('Autorize o uso dos documentos para análise.')

      setProgress('Salvando os dados da moto…')
      await savePilotProfile({ vehiclePlate:plate, motorcycleType:motorcycleType.trim(), vehicleColor:vehicleColor.trim() })
      const paths = {}
      for (const kind of ['profile','motorcycle','cnh-front','cnh-back']) {
        setProgress('Enviando ' + kind + '…')
        paths[kind] = await uploadPilotDocument(files[kind], kind)
      }
      setProgress('Enviando cadastro para análise…')
      await submitPilotApplication({
        cnhCategory, cnhExpiry,
        profilePhotoPath:paths.profile,
        motorcyclePhotoPath:paths.motorcycle,
        cnhFrontPath:paths['cnh-front'],
        cnhBackPath:paths['cnh-back'],
      })
      Alert.alert('Cadastro enviado', 'Seus documentos foram enviados para análise.')
      navigate('pilot')
    } catch (e) { setGlobalError(friendlyError(e)) }
    finally { setBusy(false); setProgress('') }
  }

  const FileRow = ({ kind, label, document }) => <View style={styles.fileRow}><View style={styles.flex}><Text style={styles.label}>{label}</Text><Text style={styles.muted}>{files[kind]?.fileName || files[kind]?.name || (files[kind] ? 'Arquivo selecionado' : 'Nenhum arquivo')}</Text></View><Pressable style={styles.smallButton} onPress={() => document ? pickDocument(kind) : pickImage(kind)}><Text style={styles.smallButtonText}>Selecionar</Text></Pressable></View>

  return <Screen title="Cadastro de piloto" subtitle="DOCUMENTAÇÃO" onBack={() => navigate('pilot')} footer={false}>
    <Card>
      <Notice>Seus documentos ficam em armazenamento privado e só são usados para verificar o cadastro de Piloto Parceiro.</Notice>
      <Field label="Placa da moto" value={vehiclePlate} onChangeText={v => setVehiclePlate(v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7))} placeholder="ABC1D23" autoCapitalize="characters" maxLength={7} />
      <Field label="Tipo ou modelo" value={motorcycleType} onChangeText={setMotorcycleType} placeholder="CG 160, Factor 150..." />
      <Field label="Cor" value={vehicleColor} onChangeText={setVehicleColor} placeholder="Preta" />
      <Field label="Categoria CNH" value={cnhCategory} onChangeText={v => setCnhCategory(v.toUpperCase().slice(0,2))} maxLength={2} />
      <Field label="Validade CNH (AAAA-MM-DD)" value={cnhExpiry} onChangeText={setCnhExpiry} placeholder="2030-12-31" />
      <FileRow kind="profile" label="Foto atual do piloto" />
      <FileRow kind="motorcycle" label="Foto da moto" />
      <FileRow kind="cnh-front" label="CNH — frente" document />
      <FileRow kind="cnh-back" label="CNH — verso" document />
      <CheckLine value={consent} onChange={setConsent} label="Confirmo que os dados são meus e autorizo o uso destes arquivos para análise." />
      {progress ? <Notice>{progress}</Notice> : null}
      <Button onPress={submit} disabled={busy}>{busy ? 'Enviando…' : 'Enviar cadastro para análise'}</Button>
    </Card>
  </Screen>
}

function CompanyScreen({ navigate, setGlobalError }) {
  const emptyForm = { id:null, name:'', description:'', category:'Outros', price:'', imageUrl:'', active:true }
  const [companies, setCompanies] = useState([])
  const [selected, setSelected] = useState(null)
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [tab, setTab] = useState('catalog')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  const restaurantId = selected?.restaurant_id || selected?.restaurantId || null

  const load = useCallback(async (forcedCompany = null) => {
    setLoading(true)
    try {
      const list = await loadMyCompanies()
      setCompanies(list)
      const company = forcedCompany || selected || list[0] || null
      setSelected(company)
      const rid = company?.restaurant_id || company?.restaurantId
      if (rid) {
        const [nextOrders, nextProducts] = await Promise.all([
          loadCompanyOrders(rid),
          loadCompanyCatalog(rid),
        ])
        setOrders(nextOrders)
        setProducts(nextProducts)
      } else {
        setOrders([])
        setProducts([])
      }
    } catch (e) { setGlobalError(friendlyError(e)) }
    finally { setLoading(false) }
  }, [selected?.restaurant_id, selected?.restaurantId])

  useEffect(() => { load() }, [])

  async function advance(row) {
    const nextMap = { novo:'confirmado', confirmado:'preparando', preparando:'pronto' }
    const next = nextMap[row.status]
    if (!next) return
    try { await advanceOrder(row.id,next,false); await load() } catch (e) { setGlobalError(friendlyError(e)) }
  }

  function editProduct(row) {
    setForm({
      id: row.id,
      name: row.name || '',
      description: row.description || '',
      category: row.category || 'Outros',
      price: (Number(row.price_cents || 0) / 100).toFixed(2).replace('.', ','),
      imageUrl: row.image_url || '',
      active: row.active !== false,
    })
    setEditing(true)
  }

  async function saveProduct() {
    if (!restaurantId) return
    if (String(form.name).trim().length < 2) return setGlobalError('Informe o nome do produto.')
    setLoading(true)
    try {
      await saveCompanyProduct(restaurantId, form)
      setForm(emptyForm)
      setEditing(false)
      await load()
    } catch (e) { setGlobalError(friendlyError(e)) }
    finally { setLoading(false) }
  }

  async function toggleProduct(row) {
    if (!restaurantId) return
    setLoading(true)
    try {
      await setCompanyProductActive(restaurantId, row.id, !row.active)
      await load()
    } catch (e) { setGlobalError(friendlyError(e)) }
    finally { setLoading(false) }
  }

  return <Screen title="Área da empresa" subtitle="GESTÃO DA EMPRESA" onBack={() => navigate('profile')} refreshing={loading} onRefresh={() => load()}>
    {companies.length > 1 ? <ScrollView horizontal contentContainerStyle={styles.chips}>{companies.map(c => {
      const id = c.restaurant_id || c.restaurantId || c.company_id || c.companyId
      return <Pressable key={id} onPress={() => load(c)} style={[styles.chip, (selected?.restaurant_id || selected?.restaurantId) === (c.restaurant_id || c.restaurantId) && styles.chipActive]}><Text>{c.name || c.nome || 'Empresa'}</Text></Pressable>
    })}</ScrollView> : null}

    <View style={styles.row}>
      <Button style={{flex:1}} variant={tab === 'catalog' ? 'primary' : 'secondary'} onPress={() => setTab('catalog')}>Cardápio</Button>
      <Button style={{flex:1}} variant={tab === 'orders' ? 'primary' : 'secondary'} onPress={() => setTab('orders')}>Pedidos</Button>
    </View>

    {tab === 'catalog' ? <>
      <Button onPress={() => { setForm(emptyForm); setEditing(true) }}>+ Adicionar prato</Button>

      {editing ? <Card>
        <Text style={styles.cardTitle}>{form.id ? 'Editar prato' : 'Novo prato'}</Text>
        <Field label="Nome do prato" value={form.name} onChangeText={v => setForm(x => ({...x,name:v}))} placeholder="Ex.: Pizza Calabresa" maxLength={80} />
        <Field label="Descrição" value={form.description} onChangeText={v => setForm(x => ({...x,description:v}))} placeholder="Ingredientes e detalhes" multiline maxLength={500} />
        <Field label="Categoria" value={form.category} onChangeText={v => setForm(x => ({...x,category:v}))} placeholder="Pizzas, Bebidas..." maxLength={50} />
        <Field label="Preço (R$)" value={form.price} onChangeText={v => setForm(x => ({...x,price:v}))} placeholder="39,90" keyboardType="decimal-pad" />
        <Field label="URL da imagem (opcional)" value={form.imageUrl} onChangeText={v => setForm(x => ({...x,imageUrl:v}))} placeholder="https://..." autoCapitalize="none" />
        <View style={styles.totalLine}><Text style={styles.cardTitle}>Disponível no cardápio</Text><Switch value={form.active} onValueChange={v => setForm(x => ({...x,active:v}))} /></View>
        <Button disabled={loading} onPress={saveProduct}>{form.id ? 'Salvar alterações' : 'Cadastrar prato'}</Button>
        <Button variant="secondary" onPress={() => { setEditing(false); setForm(emptyForm) }}>Cancelar</Button>
      </Card> : null}

      {products.map(row => <Card key={row.id}>
        <View style={styles.row}>
          {row.image_url ? <Image source={{uri:row.image_url}} style={{width:72,height:72,borderRadius:12}} /> : <View style={[styles.productImage,{width:72,minHeight:72}]}><Text style={styles.productEmoji}>🍽️</Text></View>}
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{row.name}</Text>
            <Text style={styles.muted}>{row.category || 'Outros'}</Text>
            <Text style={styles.price}>{money(Number(row.price_cents || 0)/100)}</Text>
          </View>
        </View>
        {!!row.description && <Text style={styles.muted}>{row.description}</Text>}
        <Notice>{row.active ? 'Disponível para clientes' : 'Produto desativado'}</Notice>
        <View style={styles.row}>
          <Button style={{flex:1}} variant="secondary" onPress={() => editProduct(row)}>Editar</Button>
          <Button style={{flex:1}} onPress={() => toggleProduct(row)}>{row.active ? 'Desativar' : 'Ativar'}</Button>
        </View>
      </Card>)}
      {!products.length && !loading ? <Card><Text style={styles.cardTitle}>Nenhum prato cadastrado</Text><Text style={styles.muted}>Use “Adicionar prato” para criar o primeiro item desta empresa.</Text></Card> : null}
    </> : <>
      {orders.map(row => {
        const order = orderData(row)
        const nextMap = { novo:'Confirmar pedido', confirmado:'Começar preparo', preparando:'Marcar como pronto' }
        return <Card key={row.id}><View style={styles.totalLine}><Text style={styles.cardTitle}>#{shortId(row.id)}</Text><Text style={styles.statusPill}>{row.status}</Text></View><Text style={styles.muted}>{order.cliente?.nome || 'Cliente'} · {order.entrega?.bairro || ''}</Text><Text style={styles.orderTotal}>{money(order.total)}</Text>{nextMap[row.status] ? <Button onPress={() => advance(row)}>{nextMap[row.status]}</Button> : null}</Card>
      })}
      {!orders.length && !loading ? <Card><Text style={styles.cardTitle}>Nenhum pedido encontrado</Text></Card> : null}
    </>}
  </Screen>
}

function LegalScreen({ navigate, type }) {
  const privacy = type !== 'terms'
  return <Screen title={privacy ? 'Privacidade e dados' : 'Termos de Uso'} subtitle="PRATOPRONTO" onBack={() => navigate('profile')} footer={false}>
    <Card>
      <Text style={styles.cardTitle}>{privacy ? 'Como seus dados são usados' : 'Condições de uso'}</Text>
      <Text style={styles.legalText}>{privacy
        ? 'O PratoPronto utiliza dados da conta, endereço e histórico de pedidos para autenticação, entrega, suporte e segurança. Documentos de Piloto Parceiro ficam em armazenamento privado e são usados para análise do cadastro. Você pode solicitar a exclusão dos dados conforme as regras do serviço e obrigações legais.'
        : 'Ao usar o PratoPronto, você concorda em fornecer informações corretas, não abusar da plataforma e confirmar pedidos apenas quando desejar realizar a compra. Valores e disponibilidade são confirmados pelo restaurante antes da finalização.'}</Text>
      <Text style={styles.help}>Consulte a versão web para o documento jurídico completo antes do lançamento público.</Text>
    </Card>
  </Screen>
}

function CheckLine({ value, onChange, label }) {
  return <Pressable style={styles.checkLine} onPress={() => onChange(!value)}><View style={[styles.checkBox, value && styles.checkBoxOn]}><Text style={styles.checkMark}>{value ? '✓' : ''}</Text></View><Text style={styles.checkText}>{label}</Text></Pressable>
}

const styles = StyleSheet.create({
  flex:{ flex:1 },
  flexText:{ flex:1, paddingRight:10 },
  safe:{ flex:1, backgroundColor:BG },
  center:{ alignItems:'center', justifyContent:'center' },
  bootText:{ color:'#fff', marginTop:14, fontWeight:'700' },
  topbar:{ height:62, backgroundColor:BLACK, flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14 },
  backButton:{ width:40, height:40, alignItems:'center', justifyContent:'center' },
  backSpace:{ width:40 },
  backText:{ color:'#fff', fontSize:38, lineHeight:40 },
  brandMini:{ flexDirection:'row', alignItems:'center', gap:8 },
  brandMiniText:{ color:'#fff', fontSize:18, fontWeight:'900' },
  pacDot:{ width:18, height:18, borderRadius:9, backgroundColor:YELLOW },
  scroll:{ padding:16, gap:12 },
  heading:{ marginBottom:2 },
  eyebrow:{ fontSize:11, letterSpacing:1.5, fontWeight:'900', color:'#767676' },
  eyebrowYellow:{ fontSize:11, letterSpacing:1.6, fontWeight:'900', color:YELLOW, marginTop:4 },
  h1:{ color:BLACK, fontSize:30, fontWeight:'900', marginTop:3 },
  card:{ backgroundColor:'#fff', borderRadius:18, borderWidth:1, borderColor:BORDER, padding:16, gap:12, shadowColor:'#000', shadowOpacity:.05, shadowRadius:10, shadowOffset:{width:0,height:4}, elevation:1 },
  cardTitle:{ color:BLACK, fontSize:17, fontWeight:'900' },
  muted:{ color:MUTED, lineHeight:20 },
  label:{ fontSize:13, fontWeight:'800', color:'#303030', marginBottom:6 },
  fieldWrap:{ gap:0 },
  input:{ minHeight:48, borderWidth:1, borderColor:'#D8D8D8', backgroundColor:'#FAFAFA', borderRadius:12, paddingHorizontal:13, fontSize:16, color:BLACK },
  inputDisabled:{ backgroundColor:'#EFEFEF', color:'#777' },
  textarea:{ minHeight:90, paddingTop:12, textAlignVertical:'top' },
  help:{ color:'#777', fontSize:12, lineHeight:18, marginTop:-4 },
  button:{ minHeight:50, backgroundColor:YELLOW, borderRadius:13, alignItems:'center', justifyContent:'center', paddingHorizontal:16, marginTop:2 },
  buttonSecondary:{ backgroundColor:'#fff', borderWidth:1, borderColor:'#CFCFCF' },
  buttonGhost:{ backgroundColor:'transparent', borderWidth:1, borderColor:'transparent' },
  buttonDisabled:{ opacity:.45 },
  buttonText:{ color:BLACK, fontSize:15, fontWeight:'900' },
  buttonTextDark:{ color:BLACK },
  link:{ color:'#2A4FA2', fontWeight:'800', textAlign:'center', paddingVertical:7 },
  row:{ flexDirection:'row', gap:10, alignItems:'center' },
  ufBox:{ width:82 },
  numberBox:{ width:100 },
  notice:{ backgroundColor:'#FFF7C8', borderRadius:12, padding:12, borderWidth:1, borderColor:'#F2DD66' },
  noticeError:{ backgroundColor:'#FFE4E4', borderColor:'#F5BABA' },
  noticeText:{ color:'#4A3C00', fontWeight:'600', lineHeight:19 },
  hero:{ minHeight:520, backgroundColor:BLACK, margin:-16, padding:28, paddingTop:65, alignItems:'center', justifyContent:'center', gap:16 },
  logoBig:{ width:96, height:96, borderRadius:48, backgroundColor:YELLOW, position:'relative', overflow:'hidden' },
  logoMouth:{ position:'absolute', right:-4, top:27, width:50, height:42, backgroundColor:BLACK, transform:[{rotate:'-15deg'}] },
  heroTitle:{ color:'#fff', fontSize:42, fontWeight:'900' },
  heroText:{ color:'#D0D0D0', textAlign:'center', lineHeight:23, marginBottom:8 },
  homeFeatures:{ marginTop:34, gap:12 },
  featureIcon:{ fontSize:28 },
  bottomNav:{ position:'absolute', left:0, right:0, bottom:0, height:78, backgroundColor:BLACK, flexDirection:'row', borderTopWidth:1, borderTopColor:'#292929', paddingBottom:Platform.OS === 'ios' ? 12 : 5 },
  navItem:{ flex:1, alignItems:'center', justifyContent:'center', gap:3 },
  navIcon:{ color:'#A8A8A8', fontSize:20 },
  navLabel:{ color:'#A8A8A8', fontSize:10, fontWeight:'800', maxWidth:68 },
  navActive:{ color:YELLOW },
  chips:{ gap:8, paddingVertical:4 },
  chip:{ paddingHorizontal:14, paddingVertical:9, borderRadius:99, backgroundColor:'#fff', borderWidth:1, borderColor:BORDER },
  chipActive:{ backgroundColor:YELLOW, borderColor:YELLOW },
  chipText:{ fontWeight:'800', color:'#666' },
  chipTextActive:{ color:BLACK },
  productCard:{ flexDirection:'row', alignItems:'stretch', padding:12 },
  productImage:{ width:82, minHeight:90, backgroundColor:'#FFF5A6', borderRadius:14, alignItems:'center', justifyContent:'center' },
  productEmoji:{ fontSize:38 },
  productInfo:{ flex:1, paddingLeft:13, gap:5 },
  productBottom:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:'auto' },
  price:{ fontSize:18, fontWeight:'900' },
  addButton:{ width:38, height:38, borderRadius:19, backgroundColor:BLACK, alignItems:'center', justifyContent:'center' },
  addButtonText:{ color:YELLOW, fontSize:24, lineHeight:26, fontWeight:'900' },
  cartItem:{ flexDirection:'row', alignItems:'center' },
  qty:{ flexDirection:'row', alignItems:'center', gap:8 },
  qtyButton:{ width:34, height:34, borderRadius:17, backgroundColor:'#EFEFEF', alignItems:'center', justifyContent:'center' },
  qtyText:{ minWidth:20, textAlign:'center', fontWeight:'900' },
  totalLine:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:10 },
  totalValue:{ fontSize:20, fontWeight:'900' },
  option:{ minHeight:50, borderWidth:1, borderColor:BORDER, borderRadius:12, paddingHorizontal:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  optionSelected:{ borderColor:BLACK, backgroundColor:'#FFFBE4' },
  optionText:{ fontWeight:'800' },
  quoteBox:{ gap:10, borderTopWidth:1, borderTopColor:BORDER, paddingTop:12 },
  orderTotal:{ fontSize:20, fontWeight:'900', marginTop:6 },
  statusPill:{ backgroundColor:'#F1F1F1', borderRadius:99, paddingHorizontal:10, paddingVertical:5, fontWeight:'800', fontSize:12 },
  checkLine:{ flexDirection:'row', alignItems:'flex-start', gap:10, paddingVertical:5 },
  checkBox:{ width:22, height:22, borderRadius:6, borderWidth:1, borderColor:'#AAA', alignItems:'center', justifyContent:'center', marginTop:1 },
  checkBoxOn:{ backgroundColor:YELLOW, borderColor:BLACK },
  checkMark:{ fontWeight:'900' },
  checkText:{ flex:1, lineHeight:20, color:'#333' },
  profileCard:{ alignItems:'center' },
  avatar:{ width:82, height:82, borderRadius:41, backgroundColor:BLACK, alignItems:'center', justifyContent:'center' },
  avatarText:{ color:YELLOW, fontSize:26, fontWeight:'900' },
  profileName:{ fontSize:24, fontWeight:'900' },
  accountId:{ color:'#555', fontSize:11, textAlign:'center' },
  statsRow:{ flexDirection:'row', width:'100%', marginTop:8 },
  stat:{ flex:1, alignItems:'center', borderRightWidth:1, borderRightColor:BORDER },
  statValue:{ fontSize:20, fontWeight:'900' },
  statLabel:{ fontSize:11, color:MUTED },
  sectionTitle:{ fontSize:20, fontWeight:'900', marginTop:8 },
  fileRow:{ flexDirection:'row', alignItems:'center', gap:10, borderTopWidth:1, borderTopColor:BORDER, paddingVertical:10 },
  smallButton:{ backgroundColor:BLACK, borderRadius:10, paddingHorizontal:12, paddingVertical:10 },
  smallButtonText:{ color:YELLOW, fontWeight:'900' },
  globalError:{ position:'absolute', left:12, right:12, bottom:92, backgroundColor:'#7D1818', borderRadius:12, minHeight:50, padding:12, flexDirection:'row', alignItems:'center', gap:8, zIndex:50 },
  globalErrorText:{ color:'#fff', flex:1, fontWeight:'700' },
  globalErrorClose:{ color:'#fff', fontSize:24, paddingHorizontal:4 },
  modalOverlay:{ flex:1, backgroundColor:'rgba(0,0,0,.78)', padding:14, justifyContent:'center' },
  modalCard:{ maxHeight:'92%', backgroundColor:BLACK, borderRadius:22, borderWidth:2, borderColor:YELLOW, padding:22, gap:12 },
  modalClose:{ position:'absolute', top:10, right:10, width:40, height:40, borderRadius:20, backgroundColor:'#292929', alignItems:'center', justifyContent:'center', zIndex:2 },
  modalCloseText:{ color:'#fff', fontSize:28, lineHeight:30 },
  modalIcon:{ fontSize:34 },
  modalTitle:{ color:'#fff', fontSize:25, fontWeight:'900', paddingRight:35 },
  modalText:{ color:'#D5D5D5', lineHeight:21 },
  modalStep:{ flexDirection:'row', gap:10, alignItems:'flex-start', backgroundColor:'#1B1B1B', borderRadius:12, padding:10 },
  stepNumber:{ width:30, height:30, borderRadius:15, backgroundColor:YELLOW, alignItems:'center', justifyContent:'center' },
  stepNumberText:{ fontWeight:'900' },
  modalStepTitle:{ color:'#fff', fontWeight:'900' },
  modalStepText:{ color:'#AAA', fontSize:12, marginTop:2 },
  legalText:{ color:'#333', lineHeight:23 },
})

