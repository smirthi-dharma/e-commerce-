import { recordActivity } from '../services/activity'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, Clock3, MapPin, Search, X } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

export const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0)
export function readPin() { try { return localStorage.getItem('pandiyan_pin') || '' } catch { return '' } }

export function StoreSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('')
  const [recent, setRecent] = useState(() => { try { const list = JSON.parse(localStorage.getItem('pandiyan_searches') || '[]'); return Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, 5) : [] } catch { return [] } })
  useEffect(() => { setQuery(new URLSearchParams(location.search).get('search') || ''); setOpen(false) }, [location])
  useEffect(() => {
    if (!open || !query.trim()) { setResults([]); setStatus(''); return }
    const controller = new AbortController()
    setStatus('Searching…')
    setResults([])
    const timer = setTimeout(() => api.get('/products/', { params: { search: query.trim(), page_size: 5 }, signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      const rows = data.results || data
      setResults(rows); setStatus(rows.length ? '' : 'No matches. Try a product or category name.')
    }).catch(() => { if (!controller.signal.aborted) setStatus('Suggestions unavailable. Press Search to try again.') }), 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, open])
  const remember = (term) => { const next = [term, ...recent.filter(x => x !== term)].slice(0, 5); setRecent(next); try { localStorage.setItem('pandiyan_searches', JSON.stringify(next)) } catch { /* Storage is optional. */ } }
  const search = (term) => { const text = term.trim(); if (text) { remember(text); recordActivity('search') }; setOpen(false); navigate(`/products${text ? `?search=${encodeURIComponent(text)}` : ''}`) }
  return <div className="store-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
    <form className="search-box" role="search" onSubmit={e => { e.preventDefault(); search(query) }}><input aria-label="Search products" aria-controls={open ? 'search-suggestions' : undefined} placeholder="Search for milk, rice, everyday essentials…" value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true) }} />{query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}<button type="submit" aria-label="Search products"><Search size={21} aria-hidden="true" /></button></form>
    {open && <div className="search-suggestions" id="search-suggestions"><strong>{query.trim() ? 'Matching products' : recent.length ? 'Recent searches' : 'Find your everyday favourites'}</strong>{status && <p role="status">{status}</p>}{query.trim() ? results.map(p => <Link key={p.id} to={`/products/${p.id}`} onClick={() => { remember(query.trim()); setOpen(false) }}><Search size={16} /><span>{p.name}</span><small>{money(p.price)}</small></Link>) : (recent.length ? recent : ['Rice', 'Milk', 'Snacks']).map(term => <button type="button" key={term} onClick={() => search(term)}><Clock3 size={16} />{term}<ArrowRight size={14} /></button>)}</div>}
  </div>
}

export function DeliveryPicker({ store, unavailable }) {
  const { user } = useAuth()
  const [addresses, setAddresses] = useState([])
  const [addressSearch, setAddressSearch] = useState('')
  const [addressId, setAddressId] = useState(() => { try { return localStorage.getItem('pandiyan_address') || '' } catch { return '' } })
  const selectedAddress = addresses.find(address => String(address.id) === String(addressId))
  useEffect(() => {
    setAddresses([])
    if (!user) return
    const controller = new AbortController()
    api.get('/account/addresses/', { signal:controller.signal }).then(({ data }) => setAddresses(data.results || data)).catch(() => {})
    return () => controller.abort()
  }, [user?.id])

  const [pin, setPin] = useState(readPin)
  const [draft, setDraft] = useState(pin)
  const [message, setMessage] = useState('')
  const dialog = useRef(null)
  const supported = store.delivery_pin_codes?.includes(pin)
  const submit = (e) => {
    e.preventDefault()
    if (unavailable || !Array.isArray(store.delivery_pin_codes)) { setMessage('Delivery information is unavailable. Please try again shortly.'); return }
    if (!store.delivery_pin_codes.includes(draft)) { setMessage('We don’t deliver to this PIN yet. You can still browse our store.'); return }
    setPin(draft); setAddressId(''); try { localStorage.removeItem('pandiyan_address') } catch { /* Optional storage. */ } window.dispatchEvent(new CustomEvent('store:delivery-changed', { detail:{ pin:draft } })); try { localStorage.setItem('pandiyan_pin', draft) } catch { /* Browsing works without persistence. */ }
    dialog.current.close()
  }
  return <><button className="delivery-picker" onClick={() => { setDraft(pin); setMessage(''); dialog.current.showModal() }}><MapPin size={19} /><span><strong>{supported ? (store.accepting_orders === false ? 'Orders currently paused' : store.estimated_minutes_min ? `Delivery in ${store.estimated_minutes_min}–${store.estimated_minutes_max} min` : `Delivery in ${store.delivery_timeline || 'your local area'}`) : 'Choose delivery location'}</strong><small>{supported ? (selectedAddress ? `${selectedAddress.label || selectedAddress.address_line1} · ${pin}` : `Deliver to ${pin}`) : 'Choose your delivery PIN'} <ChevronDown size={13} /></small></span></button>
    <dialog ref={dialog} aria-labelledby="delivery-title" className="delivery-dialog" onClick={e => { if (e.target === dialog.current) dialog.current.close() }}><button className="dialog-close" aria-label="Close delivery location" onClick={() => dialog.current.close()}><X size={20} /></button><div className="location-symbol"><MapPin size={28} /></div><h2 id="delivery-title">Where should we deliver?</h2>{addresses.length > 0 && <><label className="field"><span>Find a saved address</span><input value={addressSearch} onChange={event => setAddressSearch(event.target.value)} placeholder="Home, work, area…" /></label>{addresses.filter(address => `${address.label} ${address.address_line1} ${address.locality}`.toLowerCase().includes(addressSearch.toLowerCase())).map(address => <button className="button secondary full" key={address.id} onClick={() => { if (!store.delivery_pin_codes?.includes(address.pin_code)) { setMessage('This saved address is outside our current delivery area.'); return } setPin(address.pin_code); setAddressId(String(address.id)); try { localStorage.setItem('pandiyan_pin', address.pin_code); localStorage.setItem('pandiyan_address', String(address.id)) } catch { /* Optional storage. */ } window.dispatchEvent(new CustomEvent('store:delivery-changed', { detail:{ pin:address.pin_code, addressId:address.id } })); dialog.current.close() }}>{address.label || address.recipient_name} · {address.address_line1} · {address.pin_code}</button>)}</>}<p>Check delivery availability in your neighbourhood.</p><form onSubmit={submit}><label htmlFor="delivery-pin">Your PIN code</label><input id="delivery-pin" autoFocus required pattern="[1-9][0-9]{5}" inputMode="numeric" maxLength={6} placeholder="Enter 6-digit PIN" value={draft} onChange={e => { setDraft(e.target.value.replace(/\D/g, '')); setMessage('') }} /><button className="button primary full">Check delivery</button></form>{message && <p role="status" className="notice">{message}</p>}<small>Serving {store.delivery_pin_codes?.join(' & ') || 'our local neighbourhood'}. Availability is verified again at checkout.</small></dialog>
  </>
}

export function ProductSkeletons({ count = 6 }) { return <div className="product-grid" role="status" aria-label="Loading products">{Array.from({ length: count }, (_, i) => <div className="skeleton-card" key={i}><div /><span /><span /><span /></div>)}</div> }
