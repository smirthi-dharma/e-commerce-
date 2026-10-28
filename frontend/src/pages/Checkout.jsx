import { recordActivity } from '../services/activity'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { ProductPrice } from '../components/Shared'
import api, { errorMessage } from '../services/api'
import PolicyLink from '../components/PolicyLink'
import { readPin } from '../components/StorefrontTools'
import { deliveryQuote } from '../utils/delivery'

const defaultSettings = {
  store_name: 'Pandiyan Stores',
  store_location: 'Theni, Tamil Nadu, India',
  contact_phone: '8072661435',
  business_hours: 'Every day, 9:00 AM to 9:00 PM',
  delivery_timeline: '30 minutes',
  delivery_pin_codes: ['625531', '625534'],
  delivery_fee: 30,
  free_delivery_threshold: 1000,
  minimum_order_value: 300,
}

export default function Checkout() {
  const { user } = useAuth()
  const { items, subtotal, clear, syncProduct } = useCart()
  const [form, setForm] = useState({ customer_name: user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim(), phone: user?.phone || '', address: '', delivery_pin_code: readPin(), coupon_code: '', instructions: '', payment_method: 'cod' })
  const [error, setError] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoteRetry, setQuoteRetry] = useState(0)
  const [settingsError, setSettingsError] = useState('')
  const [addresses, setAddresses] = useState([])
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const checkoutAttempt = useRef(null)
  const [wallet, setWallet] = useState(null)
  const [walletError, setWalletError] = useState('')
  const [useWallet, setUseWallet] = useState(false)
  const [storeSettings, setStoreSettings] = useState(defaultSettings)
  const [availability, setAvailability] = useState({})
  const [refreshVersion, setRefreshVersion] = useState(0)
  const navigate = useNavigate()
  const cartIds = items.map((item) => item.id).join(',')

  useEffect(() => {
    recordActivity('checkout')
    api.get('/referrals/me/wallet/').then(({ data }) => setWallet(data)).catch(() => setWalletError('Wallet could not be loaded. You can still pay by cash.'))
    api.get('/system-settings/public/').then(({ data }) => setStoreSettings({ ...defaultSettings, ...data })).catch((e) => setSettingsError(errorMessage(e)))
    api.get('/account/addresses/').then(({ data }) => {
      const saved = Array.isArray(data) ? data : data.results || []
      setAddresses(saved)
      let selected = ''; try { selected = localStorage.getItem('pandiyan_address') || '' } catch { /* Optional storage. */ }
      const preferred = saved.find(address => String(address.id) === selected) || saved.find((address) => address.is_default)
      if (preferred) useAddress(preferred)
    }).catch((e) => setSettingsError(errorMessage(e)))
  }, [])

  useEffect(() => {
    if (!items.length) return
    let current = true
    setAvailability(Object.fromEntries(items.map((item) => [item.id, { loading: true }])))
    Promise.all(items.map(async (item) => {
      try {
        const { data } = await api.get(`/products/${item.id}/`)
        if (!current) return
        syncProduct(data)
        setAvailability((state) => ({ ...state, [item.id]: { product: data, loading: false } }))
      } catch (exception) {
        if (!current) return
        setAvailability((state) => ({
          ...state,
          [item.id]: { loading: false, unavailable: exception.response?.status === 404, error: exception.response?.status !== 404 },
        }))
      }
    }))
    return () => { current = false }
  }, [cartIds, refreshVersion])

  const useAddress = (address) => setForm((current) => ({
    ...current,
    customer_name: address.recipient_name,
    phone: address.mobile_number,
    address: [address.address_line1, address.address_line2, address.locality, address.landmark, address.city, address.state, address.pin_code].filter(Boolean).join(', '),
    delivery_pin_code: address.pin_code || '',
    instructions: address.delivery_instructions || '',
  }))

  useEffect(() => {
    const changed = event => {
      const selected = addresses.find(address => address.id === event.detail?.addressId)
      if (selected) useAddress(selected)
      else if (event.detail?.pin) setForm(current => ({ ...current, delivery_pin_code:event.detail.pin }))
    }
    window.addEventListener('store:delivery-changed', changed)
    return () => window.removeEventListener('store:delivery-changed', changed)
  }, [addresses])
  const supportedPins = storeSettings.delivery_pin_codes || []
  const supportedPin = supportedPins.includes(form.delivery_pin_code)
  const estimate = deliveryQuote(subtotal, storeSettings)
  const estimatedTotal = Number(quote?.total ?? estimate.estimatedTotal)
  const walletApplied = Number(quote?.wallet_amount || 0)
  const cashDue = estimatedTotal - walletApplied
  const belowMinimum = quote ? Number(quote.remaining_for_minimum) > 0 : subtotal < Number(storeSettings.minimum_order_value || 0)
  const quoteSignature = JSON.stringify({ items: items.map(({ id, quantity }) => ({ product_id: id, quantity })), delivery_pin_code: form.delivery_pin_code, coupon_code: form.coupon_code, use_wallet: useWallet })
  useEffect(() => {
    const controller = new AbortController()
    setQuote(null); setQuoteError('')
    if (!items.length || !/^[1-9][0-9]{5}$/.test(form.delivery_pin_code)) return () => controller.abort()
    const timer = setTimeout(() => api.post('/orders/quote/', JSON.parse(quoteSignature), { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setQuote(data) })
      .catch(exception => { if (!controller.signal.aborted) setQuoteError(errorMessage(exception)) }), 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [quoteSignature, quoteRetry])

  const submit = async (event) => {
    event.preventDefault()
    if (sending.current) return
    if (!items.length) { setError('Your cart is empty.'); return }
    if (!quote?.eligible) { setError(quoteError || quote?.availability_message || 'Wait for a valid order quote before confirming.'); return }
    if (items.some((item) => availability[item.id]?.loading || availability[item.id]?.unavailable || availability[item.id]?.error || item.quantity > (availability[item.id]?.product?.stock ?? 0))) {
      setError('One or more items are unavailable or have insufficient stock. Update your basket before placing the order.')
      return
    }
    if (belowMinimum) { setError(`The minimum merchandise subtotal is ₹${Number(storeSettings.minimum_order_value).toFixed(2)}.`); return }
    if (!supportedPin) { setError(`Delivery is available only to PIN codes ${supportedPins.join(' and ')}.`); return }
    setError('')
    setBusy(true)
    sending.current = true
    try {
      const payload = { ...form, expected_total: quote.total, expected_wallet_amount: quote.wallet_amount, use_wallet: useWallet, items: items.map(({ id, quantity }) => ({ product_id: id, quantity })) }
      const signature = JSON.stringify(payload)
      if (checkoutAttempt.current?.signature !== signature) checkoutAttempt.current = { signature, key: crypto.randomUUID() }
      const { data } = await api.post('/orders/', { ...payload, checkout_key: checkoutAttempt.current.key })
      clear()
      navigate(`/orders/${data.id}?placed=1`)
    } catch (e) { setError(errorMessage(e)); setQuoteRetry(value => value + 1) } finally { setBusy(false); sending.current = false }
  }

  if (!items.length) return <section className="wrap section"><div className="empty-state"><h2>Your basket is empty</h2><p>Add something before checking out.</p><button className="button primary" onClick={() => navigate('/products')}>Browse products</button></div></section>
  const checkingAvailability = items.some((item) => !availability[item.id] || availability[item.id]?.loading)
  const unavailableItems = items.some((item) => availability[item.id]?.unavailable || (availability[item.id]?.product && item.quantity > availability[item.id].product.stock))
  const availabilityError = items.some((item) => availability[item.id]?.error)

  return <section className="wrap section checkout-page">
    <div className="section-heading"><div><span className="eyebrow">ALMOST THERE</span><h1>Checkout</h1></div></div>
    <div className="cart-layout">
      <form className="checkout-form" onSubmit={submit}>
        <div className="checkout-steps"><span>1 · Basket</span><strong>2 · Delivery & payment</strong><span>3 · Confirmation</span></div><h2>Delivery details</h2>
        {addresses.length > 0 && <label className="field"><span>Use a saved address</span><select defaultValue="" onChange={(event) => { const address = addresses.find((item) => String(item.id) === event.target.value); if (address) useAddress(address) }}><option value="">Enter delivery details manually</option>{addresses.map((address) => <option key={address.id} value={address.id}>{address.recipient_name} · {address.city} · {address.pin_code}{address.is_default ? ' (default)' : ''}</option>)}</select></label>}
        {settingsError && <p className="fine-print" role="status">{settingsError}</p>}
        <label className="field"><span>Full name</span><input required autoComplete="name" maxLength="150" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></label>
        <label className="field"><span>Mobile number</span><input required autoComplete="tel" type="tel" maxLength="20" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="field"><span>Delivery address</span><textarea required autoComplete="street-address" rows="4" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="House / flat, street, area, city" /></label>
        <label className="field"><span>PIN code</span><input required inputMode="numeric" autoComplete="postal-code" pattern="[1-9][0-9]{5}" maxLength="6" value={form.delivery_pin_code} onChange={(e) => setForm({ ...form, delivery_pin_code: e.target.value })} placeholder="Enter delivery PIN" aria-describedby="checkout-pin-help" /></label>
        <p id="checkout-pin-help" className="fine-print">{supportedPin ? 'This PIN code is serviceable.' : `Delivery is available only to PIN codes ${supportedPins.join(' and ')}.`}</p>
        <label className="field"><span>Coupon code <small>(optional)</small></span><input autoCapitalize="characters" maxLength="40" value={form.coupon_code} onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })} placeholder="Enter a coupon code" /></label>
        <label className="field"><span>Delivery instructions <small>(optional)</small></span><textarea rows="2" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>
        <h2 className="payment-heading">Payment</h2>
        {wallet?.spending_enabled && <label className="payment-option"><input type="checkbox" checked={useWallet} disabled={Number(wallet.balance) <= 0 || busy} onChange={(event) => setUseWallet(event.target.checked)} /><span><strong>Use referral wallet</strong><small>Available: ₹{Math.max(0, Number(wallet.balance)).toFixed(2)}</small></span></label>}
        {walletError && <p role="status">{walletError}</p>}
        <label className="payment-option"><input type="radio" checked readOnly /> <span><strong>Cash on Delivery</strong><small>Pay when your order arrives</small></span><b>COD</b></label>
        {unavailableItems && <div className="notice error" role="alert">Stock changed or an item is no longer available. Return to your basket and update the quantity or remove the item.</div>}
        {availabilityError && <div className="notice error" role="alert">We could not verify current stock. Retry before placing your order.</div>}
        {availabilityError && <button type="button" className="button secondary" onClick={() => setRefreshVersion((version) => version + 1)}>Retry availability check</button>}
        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="button primary full" disabled={busy || checkingAvailability || unavailableItems || availabilityError || !quote?.eligible || !supportedPin}>{busy ? 'Placing order…' : checkingAvailability ? 'Checking availability…' : !quote ? 'Waiting for order quote' : `Place order · COD ₹${cashDue.toFixed(2)}`}</button>
      </form>
      <aside className="summary-card">
        <h2>Your order</h2>
        {items.map((item) => <div className="summary-line" key={item.id}><span>{item.name} × {item.quantity}<ProductPrice product={item} /></span><strong>₹{(Number(item.price) * item.quantity).toFixed(2)}</strong></div>)}
        {quote ? <><div className="summary-line"><span>Items</span><strong>₹{Number(quote.subtotal).toFixed(2)}</strong></div><div className="summary-line"><span>Coupon savings</span><strong>−₹{Number(quote.discount_amount).toFixed(2)}</strong></div><div className="summary-line"><span>Delivery</span><strong>₹{Number(quote.delivery_fee).toFixed(2)}</strong></div><div className="summary-total"><span>Total</span><strong>₹{Number(quote.total).toFixed(2)}</strong></div><p>Estimated delivery: {quote.estimated_minutes_min}–{quote.estimated_minutes_max} minutes</p>{quote.availability_message && <p role="status">{quote.availability_message}</p>}</> : <p role="status">{quoteError || 'Choose a delivery PIN to get your exact order total.'}</p>}{quoteError && <button type="button" className="button secondary" onClick={() => setQuoteRetry(value => value + 1)}>Refresh quote</button>}
        {useWallet && <><div className="summary-line"><span>Estimated wallet payment</span><strong>−₹{walletApplied.toFixed(2)}</strong></div><div className="summary-line"><span>Estimated cash on delivery</span><strong>₹{cashDue.toFixed(2)}</strong></div><p className="fine-print">Available wallet funds are applied after coupon and delivery calculations. Your confirmed order shows the final split.</p></>}


        {belowMinimum && <p className="notice error">Add ₹{Number(quote?.remaining_for_minimum ?? (Number(storeSettings.minimum_order_value) - subtotal)).toFixed(2)} more to meet the ₹{Number(storeSettings.minimum_order_value).toFixed(2)} minimum merchandise subtotal.</p>}
        <p>Delivery is available to {supportedPins.join(' and ')}. Your service-area delivery fee and coupon-adjusted free-delivery eligibility are included in the quote above.</p>
        <p>The stated delivery window is {storeSettings.delivery_timeline}, subject to the store's operational capacity.</p>
        <p>This quote includes current prices, coupon savings and delivery. We check it again when you confirm and ask you to refresh if the total changes.</p>
        <p>{storeSettings.store_name} · {storeSettings.store_location}<br />{storeSettings.contact_phone} · {storeSettings.business_hours}</p>
        <div className="checkout-policy-links" aria-label="Order policies"><span>Review before ordering:</span><PolicyLink policy="terms">Terms &amp; Conditions</PolicyLink><PolicyLink policy="privacy">Privacy Policy</PolicyLink><PolicyLink policy="returns">Return &amp; Refund Policy</PolicyLink><PolicyLink policy="delivery">Delivery Policy</PolicyLink></div>
      </aside>
    </div>
  </section>
}
