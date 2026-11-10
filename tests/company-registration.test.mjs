import test from 'node:test'
import assert from 'node:assert/strict'
import { onlyDigits, validCpf } from '../src/shared/company-validation.js'

test('normaliza CPF sem pontuação', () => {
  assert.equal(onlyDigits('529.982.247-25'), '52998224725')
})

test('aceita CPF com dígitos verificadores válidos', () => {
  assert.equal(validCpf('529.982.247-25'), true)
})

test('rejeita CPF com dígito verificador incorreto', () => {
  assert.equal(validCpf('529.982.247-24'), false)
})

test('rejeita sequências repetidas e comprimentos inválidos', () => {
  assert.equal(validCpf('111.111.111-11'), false)
  assert.equal(validCpf('1234567890'), false)
  assert.equal(validCpf(''), false)
})
