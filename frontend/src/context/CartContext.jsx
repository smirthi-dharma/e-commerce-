import { createContext, useCallback, useContext, useState } from 'react'
import { readSavedCart } from '../utils/cart'
import useSavedBasket from '../hooks/useSavedBasket'

const CartContext = createContext(null)
const savedCart = () => {
  try { return readSavedCart(localStorage.getItem('sm_cart')) } catch { return [] }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(savedCart)
  const { syncMessage, reloadSavedCart } = useSavedBasket(items, setItems)
  const update = (transform) => {
    setItems(current => {
      const next = typeof transform === 'function' ? transform(current) : transform
      try { localStorage.setItem('sm_cart', JSON.stringify(next)) } catch { /* Keep the current session usable when storage is blocked. */ }
      return next
    })
  }
  const syncProduct = useCallback((product) => {
    setItems((current) => {
      const next = current.map((item) => item.id === product.id ? { ...item, ...product, quantity: item.quantity } : item)
      try { localStorage.setItem('sm_cart', JSON.stringify(next)) } catch { /* Optional persistence. */ }
      return next
    })
  }, [])
  const add = (product, quantity = 1) => {
    const availableStock = Number.isInteger(product.stock) ? product.stock : 99
    if (!product.in_stock || availableStock < 1 || quantity < 1) return
    update(current => current.some(item => item.id === product.id)
      ? current.map(item => item.id === product.id ? { ...item, ...product, quantity: Math.min(item.quantity + quantity, availableStock, 99) } : item)
      : [...current, { ...product, quantity: Math.min(quantity, availableStock, 99) }])
  }
  const setQuantity = (id, quantity) => update(current => quantity < 1
    ? current.filter(item => item.id !== id)
    : current.map(item => item.id === id ? { ...item, quantity: Math.min(quantity, item.stock ?? 99, 99) } : item).filter(item => item.quantity > 0))
  const remove = (id) => update(current => current.filter(item => item.id !== id))
  const clear = () => update([])
  const count = items.reduce((total, item) => total + item.quantity, 0)
  const subtotal = items.reduce((total, item) => total + Number(item.price) * item.quantity, 0)
  const value = { items, add, setQuantity, remove, clear, count, subtotal, syncProduct, syncMessage, reloadSavedCart }
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
