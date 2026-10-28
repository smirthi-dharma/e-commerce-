import { recordActivity } from '../services/activity'
import { ArrowLeft, Check, Heart, Minus, Plus, ShoppingBasket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Loading, ProductImage, ProductPrice } from '../components/Shared'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import api, { errorMessage } from '../services/api'
import PolicyLink from '../components/PolicyLink'

export default function ProductDetail() {
  const { id } = useParams()
  const { add, items, setQuantity } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retry, setRetry] = useState(0)
  const [photo, setPhoto] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setPhoto(''); setProduct(null); setLoadError(''); setError(''); setSaved(false)
    api.get(`/products/${id}/`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setProduct(data); recordActivity('product_view', data.id); try { const viewed = JSON.parse(localStorage.getItem('pandiyan_viewed') || '[]'); localStorage.setItem('pandiyan_viewed', JSON.stringify([data.id, ...viewed.filter(value => value !== data.id)].slice(0, 20))) } catch { /* Optional history. */ } }).catch(e => { if (!controller.signal.aborted) setLoadError(errorMessage(e)) })
    return () => controller.abort()
  }, [id, retry])
  const saveToWishlist = async () => {
    if (!user) { navigate('/login', { state:{ from:`/products/${id}` } }); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.get('/account/wishlist/')
      const savedItems = Array.isArray(data) ? data : data.results || []
      if (!savedItems.some(item => item.product.id === product.id)) await api.post('/account/wishlist/', { product_id: product.id })
      setSaved(true)
    } catch (e) { setError(errorMessage(e)) } finally { setSaving(false) }
  }
  if (loadError) return <section className="wrap section"><ErrorState message={loadError} /><button className="button secondary" onClick={() => setRetry(v => v + 1)}>Try again</button><Link to="/products" className="text-link"><ArrowLeft size={16} /> Back to products</Link></section>
  if (!product) return <Loading />
  const quantity = items.find(item => item.id === product.id)?.quantity || 0
  const inStock = product.in_stock && product.stock > 0
  return <section className="wrap section detail-layout">
    <Link to="/products" className="text-link back-link"><ArrowLeft size={16} /> Back to shopping</Link>
    <div className="detail-image"><ProductImage key={`${product.id}-${photo}`} product={photo ? { ...product, image_url: photo } : product} />{product.gallery?.length > 0 && <div className="product-gallery">{[product.image_url, ...product.gallery].filter(Boolean).map((url, index) => <button type="button" key={url} aria-label={`View product photo ${index + 1}`} onClick={() => setPhoto(url)}><img src={url} alt="" /></button>)}</div>}</div>
    <div className="detail-info"><span className="eyebrow">{product.category_name}</span><h1>{product.name}</h1>{product.brand && <p>{product.brand}</p>}<p>{product.pack_size}{product.unit_price_label && ` · ${product.unit_price_label}`}</p>{product.variants?.length > 1 && <nav className="pack-options" aria-label="Choose pack size">{product.variants.map(variant => <Link aria-current={variant.id === product.id ? 'page' : undefined} key={variant.id} to={`/products/${variant.id}`}>{variant.pack_size || variant.name} · ₹{variant.price}</Link>)}</nav>}{product.display_badge && <span className={`catalogue-badge detail-badge badge-${product.badge}`}>{product.display_badge}</span>}{product.image_is_illustration && <small className="illustration-note">Illustrative image; actual packaging may vary.</small>}<ProductPrice product={product} /><p>{product.description || 'An everyday essential, selected for your home.'}</p>{[['Ingredients', product.ingredients], ['Nutrition', product.nutrition], ['Storage', product.storage_instructions]].filter(([, value]) => value).map(([label, value]) => <details key={label}><summary>{label}</summary><p>{value}</p></details>)}<p className={inStock ? 'stock-ok' : 'stock-note'}>{inStock ? 'In stock · Ready for your basket' : 'Currently unavailable'}</p>
    <div className="detail-purchase">{quantity ? <><div className="quantity-control detail-stepper"><button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => setQuantity(product.id, quantity - 1)}><Minus size={18} /></button><span aria-live="polite">{quantity}</span><button type="button" aria-label={`Increase ${product.name} quantity`} disabled={!inStock || quantity >= Math.min(product.stock, 99)} onClick={() => add(product)}><Plus size={18} /></button></div><Link className="button primary" to="/cart"><ShoppingBasket size={18} /> View basket</Link></> : <button className="button primary" disabled={!inStock} onClick={() => add(product)}><Plus size={18} />{inStock ? 'Add to basket' : 'Out of stock'}</button>}</div>
    {quantity > 0 && <p className="basket-confirmation" role="status"><Check size={16} /> {quantity} in your basket</p>}
    <button className="button secondary wishlist-save" type="button" disabled={saving || saved} onClick={saveToWishlist}><Heart size={16} fill={saved ? 'currentColor' : 'none'} />{saving ? 'Saving…' : saved ? 'Saved to wishlist' : 'Save to wishlist'}</button><p><PolicyLink className="text-link" policy="delivery">Delivery details & charges</PolicyLink></p>{error && <ErrorState message={error} />}</div>
  </section>
}
