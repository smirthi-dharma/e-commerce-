import { useEffect, useState } from 'react'
import { ArrowRight, Minus, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DeliverySummary, EmptyState, ErrorState, ProductPrice, ProductImage } from '../components/Shared'
import PolicyLink from '../components/PolicyLink'
import BasketAlternatives from '../components/BasketAlternatives'
import { readPin } from '../components/StorefrontTools'
import { useCart } from '../context/CartContext'
import api, { errorMessage } from '../services/api'
import { deliveryQuote } from '../utils/delivery'

export default function Cart({ drawer = false }) {
  const { items, setQuantity, remove, subtotal, syncProduct, syncMessage, reloadSavedCart } = useCart()
  const [availability, setAvailability] = useState({})
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [deliverySettings, setDeliverySettings] = useState(null)
  const cartIds = items.map((item) => item.id).join(',')
  useEffect(() => {
    const refreshDelivery = () => setRefreshVersion(value => value + 1)
    window.addEventListener('store:delivery-changed', refreshDelivery)
    return () => window.removeEventListener('store:delivery-changed', refreshDelivery)
  }, [])
  useEffect(() => {
    api.get('/system-settings/public/', { params:{ pin:readPin() } })
      .then(({ data }) => setDeliverySettings(data))
      .catch((exception) => setError(errorMessage(exception)))
  }, [refreshVersion])
  useEffect(() => {
    if (!items.length) return
    let current = true
    setError('')
    setAvailability(Object.fromEntries(items.map((item) => [item.id, { loading: true }])))
    Promise.all(items.map(async (item) => {
      try {
        const { data } = await api.get(`/products/${item.id}/`)
        if (!current) return
        if (Number(item.price) !== Number(data.price)) {
          setError('Some prices changed since you added items. The basket has been updated to current prices.')
        }
        syncProduct(data)
        setAvailability((state) => ({ ...state, [item.id]: { product: data, loading: false } }))
      } catch (exception) {
        if (!current) return
        if (exception.response?.status === 404) {
          setAvailability((state) => ({ ...state, [item.id]: { product: null, loading: false } }))
        } else {
          setError(errorMessage(exception))
          setAvailability((state) => ({ ...state, [item.id]: { loading: false, error: true } }))
        }
      }
    }))
    return () => { current = false }
  }, [cartIds, refreshVersion])
  if (!items.length) return <section className="wrap section"><EmptyState title="Your basket is waiting" body="Add a few everyday favourites and they’ll show up here." /></section>
  const stockIssues = items.filter((item) => {
    const latest = availability[item.id]
    return latest && !latest.loading && !latest.error && (!latest.product || item.quantity > latest.product.stock)
  })
  const refreshing = (!deliverySettings && !error) || items.some((item) => !availability[item.id] || availability[item.id]?.loading)
  const belowMinimum = !deliveryQuote(subtotal, deliverySettings).eligible
  const availabilityError = (!deliverySettings && Boolean(error)) || items.some((item) => availability[item.id]?.error)
  return <section className={`wrap section cart-page${drawer ? ' drawer-cart-page' : ''}`}><div className="section-heading"><div><span className="eyebrow">YOUR SHOPPING</span><h1>Your basket</h1></div><Link className="text-link" to="/products">Continue shopping</Link></div><p className={`fine-print${drawer ? ' drawer-policy-note' : ''}`}>Delivery PIN eligibility, minimum order value and delivery charges are shown in our <PolicyLink className="text-link" policy="delivery">Delivery Policy</PolicyLink>.</p>{syncMessage && <div role="status"><p>{syncMessage}</p><button className="button secondary" onClick={reloadSavedCart}>Reload saved basket</button></div>}{error && <ErrorState message={error} />}{stockIssues.length > 0 && <div className="notice error" role="alert">Stock changed for one or more items. Update the quantity to the available amount or remove unavailable items before checkout.</div>}{availabilityError && <button type="button" className="button secondary" onClick={() => setRefreshVersion((version) => version + 1)}>Retry availability check</button>}<div className="cart-layout"><div className="cart-items">{items.map((item) => { const latest = availability[item.id]?.product; const available = latest?.stock ?? 0; return <article className="cart-item" key={item.id}><div className="cart-thumb"><ProductImage product={item} /></div><div className="cart-item-name"><Link to={`/products/${item.id}`}>{item.name}</Link><ProductPrice product={item} />{availability[item.id] && !availability[item.id].loading && <small className={available ? 'stock-ok' : 'stock-note'}>{latest ? `${available} available now` : availability[item.id].error ? 'Availability could not be checked' : 'No longer available'}</small>}</div><div className="quantity-control compact"><button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => setQuantity(item.id, item.quantity - 1)}><Minus size={14} /></button><span>{item.quantity}</span><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={availability[item.id]?.loading || !latest || item.quantity >= available} onClick={() => setQuantity(item.id, item.quantity + 1)}><Plus size={14} /></button></div><strong>₹{(Number(item.price) * item.quantity).toFixed(2)}</strong><button className="icon-button" aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)}><Trash2 size={17} /></button></article>})}</div><aside className="summary-card"><h2>Order summary</h2><Link className="text-link" to="/account/shopping-lists">Save as a shopping list</Link><DeliverySummary subtotal={subtotal} settings={deliverySettings} /><p>Final price and stock are checked securely when you place the order.</p>{refreshing || stockIssues.length > 0 || availabilityError || belowMinimum ? <button type="button" className="button primary full" disabled>{refreshing ? 'Checking availability…' : availabilityError ? 'Retry availability check' : belowMinimum ? 'Add items to meet the minimum' : 'Update basket to continue'}</button> : <Link className="button primary full" to="/checkout">Continue to checkout <ArrowRight size={16} /></Link>}</aside></div>{stockIssues.length > 0 && <BasketAlternatives category={stockIssues[0].category} excluded={cartIds} />}</section>
}
