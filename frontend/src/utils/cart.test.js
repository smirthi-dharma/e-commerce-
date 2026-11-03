import { describe, expect, it } from 'vitest'
import { normalizeCart, readSavedCart } from './cart'

describe('saved cart normalization', () => {
  it('returns an empty cart for malformed or unexpected stored values', () => {
    expect(readSavedCart('{bad json')).toEqual([])
    expect(readSavedCart('{"id": 1}')).toEqual([])
    expect(readSavedCart('null')).toEqual([])
  })

  it('drops invalid entries and normalizes usable persisted items', () => {
    expect(normalizeCart([
      { id: 3, name: 'Rice', price: '120.5', quantity: '2', stock: '5' },
      { id: 4, price: 'not-a-price', quantity: 1 },
      { id: 5, price: '10', quantity: 0 },
      null,
    ])).toEqual([
      { id: 3, name: 'Rice', price: 120.5, quantity: 2, stock: 5 },
    ])
  })

  it('caps persisted quantities at the cart limit', () => {
    expect(normalizeCart([{ id: 1, price: 10, quantity: 120 }])[0].quantity).toBe(99)
  })
})

describe('wholesale pricing', () => {
  const product = { price: 100, wholesale_price: '80.00', wholesale_min_quantity: 10 }
  it('switches to the wholesale rate at the minimum quantity', async () => {
    const { unitPrice, lineTotal } = await import('./cart')
    expect(unitPrice(product, 9)).toBe(100)
    expect(unitPrice(product, 10)).toBe(80)
    expect(lineTotal({ ...product, quantity: 10 })).toBe(800)
  })
  it('ignores incomplete or invalid tiers', async () => {
    const { wholesaleTier } = await import('./cart')
    expect(wholesaleTier({ price: 100, wholesale_price: '80.00', wholesale_min_quantity: null })).toBeNull()
    expect(wholesaleTier({ price: 100, wholesale_price: '120.00', wholesale_min_quantity: 5 })).toBeNull()
    expect(wholesaleTier({ price: 100, wholesale_price: null, wholesale_min_quantity: 5 })).toBeNull()
  })
})
