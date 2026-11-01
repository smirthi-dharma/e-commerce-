import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api, { errorMessage } from '../services/api'

const lines = items => items.map(item => ({ product_id: item.id, quantity: item.quantity })).sort((a, b) => a.product_id - b.product_id)
export default function useSavedBasket(items, setItems) {
  const { user, ready } = useAuth()
  const owner = user?.id
  const revision = useRef(null)
  const loadSequence = useRef(0)
  const saved = useRef('')
  const previousOwner = useRef(owner)
  const ownerRef = useRef(owner)
  const itemsRef = useRef(items)
  itemsRef.current = items
  ownerRef.current = owner
  const inFlight = useRef(false)
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(0)
  const apply = useCallback(next => {
    setItems(next)
    try { localStorage.setItem('sm_cart', JSON.stringify(next)) } catch { /* Session remains usable. */ }
  }, [setItems])
  const load = useCallback(async (mergeGuest = false) => {
    if (!owner) return
    const sequence = ++loadSequence.current
    const initialSignature = JSON.stringify(lines(itemsRef.current))
    const { data } = await api.get('/account/cart/')
    if (ownerRef.current !== owner || sequence !== loadSequence.current) return
    if (!mergeGuest && initialSignature !== JSON.stringify(lines(itemsRef.current))) {
      setMessage('Your basket changed while the saved basket was loading. Reload to use the saved version; your current basket is still available here.')
      return
    }
    let next = data.items
    if (mergeGuest) {
      const combined = new Map(data.items.map(item => [item.id, item]))
      for (const item of itemsRef.current) {
        const remote = combined.get(item.id)
        combined.set(item.id, { ...item, ...remote, quantity: Math.min((remote?.quantity || 0) + item.quantity, remote?.stock ?? item.stock ?? 99, 99) })
      }
      next = [...combined.values()]
    }
    revision.current = data.revision
    saved.current = JSON.stringify(lines(data.items))
    setMessage('')
    apply(next)
    setTick(value => value + 1)
    try { localStorage.setItem('pandiyan_cart_owner', String(owner)) } catch { /* Optional persistence. */ }
  }, [owner, apply])
  useEffect(() => {
    if (!ready) return
    revision.current = null
    if (!owner) {
      if (previousOwner.current) { apply([]); try { localStorage.removeItem('pandiyan_cart_owner') } catch { /* Optional storage. */ } }
      previousOwner.current = owner
      return
    }
    previousOwner.current = owner
    let merge = true
    try { merge = localStorage.getItem('pandiyan_cart_owner') !== String(owner) } catch { /* Preserve guest items. */ }
    load(merge).catch(exception => setMessage(errorMessage(exception)))
  }, [owner, ready, load])
  const signature = JSON.stringify(lines(items))
  useEffect(() => {
    if (!owner || revision.current === null || signature === saved.current || message) return
    const timer = setTimeout(async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        const { data } = await api.put('/account/cart/', { revision: revision.current, items: JSON.parse(signature) })
        if (ownerRef.current !== owner) return
        revision.current = data.revision
        saved.current = JSON.stringify(lines(data.items))
        if (JSON.stringify(lines(itemsRef.current)) === signature) apply(data.items)
      } catch (exception) { if (ownerRef.current === owner) setMessage(errorMessage(exception)) }
      finally { inFlight.current = false; setTick(value => value + 1) }
    }, 500)
    return () => clearTimeout(timer)
  }, [owner, signature, message, tick, apply])
  useEffect(() => {
    const refresh = () => {
      if (owner && !inFlight.current && JSON.stringify(lines(itemsRef.current)) === saved.current) load().catch(() => {})
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [owner, load])
  return { syncMessage: message, reloadSavedCart: () => load().catch(exception => setMessage(errorMessage(exception))) }
}
