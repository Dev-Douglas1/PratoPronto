import { after, before, beforeEach, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore'
setLogLevel('silent')
let env
const context = (uid, verified = true) => env.authenticatedContext(uid, { email: uid + '@example.com', email_verified: verified }).firestore()
const order = { userId:'ana', cliente:{ nome:'Ana', email:'ana@example.com', telefone:'41000000000' }, entrega:{ endereco:'Rua de Teste', numero:'1', bairro:'Centro' }, itens:[{ id:'calabresa', quantidade:1, precoUnitario:58.9 }], total:63.9, pagamento:{ ambiente:'producao', status:'aprovado' }, status:'confirmado' }
const review = () => ({ userId:'ana', orderId:'one', nome:'Ana', notaComida:5, notaEntrega:4, comentario:'Muito boa!', createdAt:serverTimestamp() })
const profile = () => ({ nome:'Ana', email:'ana@example.com', telefone:'41999999999', endereco:'', numero:'', bairro:'', complemento:'', cep:'', cidade:'', uf:'', aceitarMarketing:false, privacyPolicyVersion:'v1', termsVersion:'v1', consentTimestamp:'2026-09-09', updatedAt:serverTimestamp() })
before(async () => { env = await initializeTestEnvironment({ projectId:'demo-pratopronto', firestore:{ host:'127.0.0.1', port:8089, rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8') } }) })
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx => { const db=ctx.firestore(); await setDoc(doc(db,'admins','empresa'),{ role:'restaurant_admin' }); await setDoc(doc(db,'orders','one'),order) })
})
after(async () => { await env?.cleanup() })
test('cadastro não concede administração, não grava senha e não permite editar outro perfil', async () => {
  const db=context('ana')
  await assertSucceeds(setDoc(doc(db,'users','ana'),profile()))
  await assertFails(setDoc(doc(db,'admins','ana'),{ role:'restaurant_admin' }))
  for (const patch of [{ senha:'segredo' },{ admin:true },{ email:'outra@example.com' }]) await assertFails(updateDoc(doc(db,'users','ana'),{ ...patch, updatedAt:serverTimestamp() }))
  await assertFails(setDoc(doc(context('bia'),'users','ana'),profile()))
})
test('cadastro pendente só cria o próprio perfil: não lê dados, não altera confirmação e não entra na empresa', async () => {
  const pending = context('ana', false)
  await assertSucceeds(setDoc(doc(pending,'users','ana'),profile()))
  for (const path of ['users/ana','admins/ana','orders/one','orders/one/events/1','refundRequests/one','reviews/one','productSettings/calabresa','emailChallenges/ana','emailCodeLimits/any','loginEmailJobs/any']) {
    await assertFails(getDoc(doc(pending, path)))
  }
  await assertFails(updateDoc(doc(pending,'users','ana'),{ nome:'Outro',updatedAt:serverTimestamp() }))
  await assertFails(updateDoc(doc(context('ana'),'users','ana'),{ emailVerificado:true,updatedAt:serverTimestamp() }))
  await assertFails(setDoc(doc(pending,'emailChallenges','ana'),{ code:'1234',state:'active' }))
  await assertFails(setDoc(doc(context('empresa'),'emailChallenges','ana'),{ state:'consumed' }))
  await assertSucceeds(getDoc(doc(context('ana'),'users','ana')))
})
test('nenhum navegador cria pedido ou altera pagamento, preço, etapa e histórico', async () => {
  for (const uid of ['ana','empresa']) {
    const db=context(uid)
    await assertFails(setDoc(doc(db,'orders','fake'),{ ...order, userId:uid }))
    await assertFails(updateDoc(doc(db,'orders','one'),{ total:0.01 }))
    await assertFails(updateDoc(doc(db,'orders','one'),{ status:'preparando' }))
    await assertFails(updateDoc(doc(db,'orders','one'),{ 'pagamento.status':'reembolsado' }))
    await assertFails(setDoc(doc(db,'orders','one','events','fake'),{ status:'entregue' }))
    await assertFails(deleteDoc(doc(db,'orders','one')))
  }
})
test('somente dono e administrador verificado leem nomes e endereços', async () => {
  await assertSucceeds(getDoc(doc(context('ana'),'orders','one')))
  await assertSucceeds(getDocs(query(collection(context('ana'),'orders'),where('userId','==','ana'))))
  await assertSucceeds(getDocs(collection(context('empresa'),'orders')))
  await assertFails(getDoc(doc(context('bia'),'orders','one')))
  await assertFails(getDocs(collection(context('ana'),'orders')))
  await assertFails(getDocs(collection(context('empresa',false),'orders')))
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'orders','one')))
})
test('solicitação ausente é legível pelo dono; criação e decisão de reembolso exigem servidor', async () => {
  await assertSucceeds(getDoc(doc(context('ana'),'refundRequests','one')))
  await assertFails(getDoc(doc(context('bia'),'refundRequests','one')))
  for (const uid of ['ana','empresa']) await assertFails(setDoc(doc(context(uid),'refundRequests','one'),{ userId:'ana', orderId:'one', status:'reembolsado' }))
})
test('avaliação exige entrega, dono e nota válida; empresa responde sem adulterar notas', async () => {
  const db=context('ana')
  await assertFails(setDoc(doc(db,'reviews','one'),review()))
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(),'orders','one'),{ status:'entregue' }))
  await assertFails(setDoc(doc(context('bia'),'reviews','one'),{ ...review(),userId:'bia' }))
  await assertFails(setDoc(doc(db,'reviews','one'),{ ...review(),notaComida:6 }))
  await assertSucceeds(setDoc(doc(db,'reviews','one'),review()))
  await assertFails(setDoc(doc(db,'reviews','one'),review()))
  await assertSucceeds(updateDoc(doc(context('empresa'),'reviews','one'),{ resposta:'Obrigado pela avaliação!',respondidoEm:serverTimestamp(),respondidoPor:'empresa' }))
  await assertFails(updateDoc(doc(context('empresa'),'reviews','one'),{ notaComida:1 }))
})
test('clientes consultam cardápio, somente empresa edita preços válidos', async () => {
  const data={ preco:65.9,disponivel:false,updatedAt:serverTimestamp() }
  await assertSucceeds(setDoc(doc(context('empresa'),'productSettings','calabresa'),data))
  await assertSucceeds(getDoc(doc(context('ana'),'productSettings','calabresa')))
  await assertFails(setDoc(doc(context('ana'),'productSettings','calabresa'),data))
  await assertFails(setDoc(doc(context('empresa'),'productSettings','calabresa'),{ ...data,preco:10 }))
})
test('filas, credenciais, resumos e tabelas financeiras são inacessíveis ao navegador', async () => {
  for (const path of ['quotes/one','providerPayments/one','refundJobs/one','webhookEvents/one','rateLimits/one']) {
    for (const uid of ['ana','empresa']) {
      await assertFails(getDoc(doc(context(uid),path)))
      await assertFails(setDoc(doc(context(uid),path),{ status:'done' }))
    }
  }
  await assertSucceeds(getDoc(doc(context('empresa'),'settings','restaurant')))
  await assertFails(getDoc(doc(context('ana'),'settings','restaurant')))
  await assertFails(setDoc(doc(context('empresa'),'settings','restaurant'),{ acceptingOrders:true }))
})
test('pedido de exclusão impede recriar perfil mesmo com token ainda válido', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(),'privacyRequests','ana'),{ userId:'ana',status:'concluido' }))
  await assertFails(setDoc(doc(context('ana'),'users','ana'),profile()))
  await assertSucceeds(getDoc(doc(context('ana'),'privacyRequests','ana')))
  await assertFails(deleteDoc(doc(context('ana'),'privacyRequests','ana')))
})

test('nome, telefone e moderação são exigidos pelo banco mesmo fora do formulário', async () => {
  const ref = doc(context('ana'), 'users', 'ana')
  for (const patch of [{ nome:'A' }, { nome:'A'.repeat(81) }, { nome:'Ana123' }, { nome:'Porra Silva' }, { telefone:'' }, { telefone:'419999999999' }, { telefone:'(41) 99999-9999' }]) {
    await assertFails(setDoc(ref, { ...profile(), ...patch }))
  }
  for (const nome of ['João D’Ávila','Ricardo','李华']) await assertSucceeds(setDoc(ref, { ...profile(), nome }))
})
test('somente empresa verificada salva ofertas válidas e alterações de preço preservam a oferta', async () => {
  const promocao = { titulo:'Especial da casa', percentual:15, inicio:Date.now(), fim:Date.now()+86400000, ativa:true }
  const data = { preco:58.9, disponivel:true, promocao, updatedAt:serverTimestamp() }
  const ref = doc(context('empresa'), 'productSettings','calabresa')
  await assertFails(setDoc(doc(context('ana'),'productSettings','calabresa'), data))
  await assertFails(setDoc(doc(context('empresa',false),'productSettings','calabresa'), data))
  for (const patch of [{ percentual:100 }, { percentual:1.5 }, { fim:promocao.inicio }, { titulo:'p0rr4' }, { titulo:'a'.repeat(61) }, { ativa:'true' }, { extra:'campo injetado' }]) await assertFails(setDoc(ref, { ...data,promocao:{ ...promocao,...patch } }))
  await assertSucceeds(setDoc(ref,data))
  await assertSucceeds(setDoc(ref,{ preco:65.9,updatedAt:serverTimestamp() },{ merge:true }))
  const read = await assertSucceeds(getDoc(doc(context('ana'),'productSettings','calabresa')))
  if (read.data().promocao.percentual !== 15) throw new Error('O desconto foi perdido ao salvar preço.')
})
test('avaliação e resposta ofensivas são recusadas sem proibir críticas do cliente', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(),'orders','one'),{ status:'entregue' }))
  const ref=doc(context('ana'),'reviews','one')
  for (const comentario of ['p0rr4!', 'm.e.r.d.a', 'CARALHO']) await assertFails(setDoc(ref,{ ...review(),comentario }))
  await assertSucceeds(setDoc(ref,{ ...review(),comentario:'A entrega demorou muito, não gostei.' }))
  await assertFails(updateDoc(doc(context('empresa'),'reviews','one'),{ resposta:'foda-se', respondidoEm:serverTimestamp(), respondidoPor:'empresa' }))
})
