import { recordActivity } from '../services/activity'
import { Link } from 'react-router-dom'
import { Leaf, LoaderCircle, Minus, PackageOpen, Plus, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { money } from './StorefrontTools'
import { productImageSource } from '../utils/catalogueArtwork'
import { deliveryQuote } from '../utils/delivery'

export function Loading({ label = 'Loading your shop…' }) {
  return <div className="state-card"><LoaderCircle className="spin" size={25} aria-hidden="true" /><span>{label}</span></div>
}

export function ErrorState({ message }) {
  return <div className="notice error" role="alert">{message || 'We could not load this right now.'}</div>
}

export function ProductPrice({ product }) {
  const price = Number(product.price)
  const mrp = Number(product.mrp_is_sample ? product.regular_price : product.mrp || product.regular_price)
  const discount = mrp > price ? Math.round((mrp - price) / mrp * 100) : 0
  const format = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value)
  return <div className="product-pricing">
    <strong>{format(price)}</strong>
    {mrp > price && <s aria-label={`${product.mrp_is_sample || !product.mrp ? 'Previous price' : 'MRP'} ${format(mrp)}`}>{format(mrp)}</s>}
    {discount > 0 && <span className="price-discount"><span aria-hidden="true">·</span><span className="product-savings">{discount}% OFF</span></span>}
  </div>
}

export function DeliverySummary({ subtotal, settings }) {
  const quote = deliveryQuote(subtotal, settings)
  return <>
    <div className="summary-line"><span>Merchandise subtotal</span><strong>₹{subtotal.toFixed(2)}</strong></div>
    <div className="summary-line"><span>Delivery fee</span><strong>{quote.deliveryFee ? `₹${quote.deliveryFee.toFixed(2)}` : quote.freeDelivery ? 'Free' : 'Calculated at checkout'}</strong></div>
    {quote.eligible && (quote.freeDelivery
      ? <p className="delivery-eligibility" role="status">Congratulations! Your order qualifies for free delivery.</p>
      : <p className="delivery-eligibility">Add ₹{quote.remainingForFree.toFixed(2)} more to your cart to qualify for free delivery.</p>)}
    {!quote.eligible && <p className="delivery-eligibility">Add ₹{quote.remainingForMinimum.toFixed(2)} more to meet the minimum order value.</p>}
    <div className="summary-total"><span>Estimated total</span><strong>₹{quote.estimatedTotal.toFixed(2)}</strong></div>
  </>
}

export function EmptyState({ title, body, to = '/products', action = 'Browse products' }) {
  return <div className="empty-state"><PackageOpen size={38} /><h2>{title}</h2><p>{body}</p><Link className="button primary" to={to}>{action}</Link></div>
}

export function ProductCard({ product }) {
  const { items, add, setQuantity } = useCart()
  const quantity = items.find(item => item.id === product.id)?.quantity || 0
  const unavailable = !product.in_stock || product.stock < 1
  return <article className="product-card">
    <Link to={`/products/${product.id}`} className="product-image" aria-label={`View ${product.name}`}>
      <ProductImage product={product} />
      {product.display_badge && <span className={`catalogue-badge badge-${product.badge}`}>{product.display_badge}</span>}
    </Link>
    <div className="product-info">
      <span className="product-category"><ShoppingBag size={10} aria-hidden="true" /> {product.category_name}</span>
      <Link to={`/products/${product.id}`} className="product-title">{product.name}</Link>
      <span className="product-pack">{product.pack_size || 'Per item'}</span>
      {product.brand && <small>{product.brand}</small>}
      {product.unit_price_label && <small>{product.unit_price_label}</small>}
      <div className="product-buy"><ProductPrice product={product} />
        {quantity ? <div className="quantity-control compact cart-stepper"><button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => setQuantity(product.id, quantity - 1)}><Minus size={16} /></button><span aria-live="polite">{quantity}</span><button type="button" aria-label={`Increase ${product.name} quantity`} disabled={unavailable || quantity >= Math.min(product.stock, 99)} onClick={() => { add(product); recordActivity('add_to_cart', product.id) }}><Plus size={16} /></button></div> : <button className="quick-add" aria-label={`Add ${product.name} to cart`} disabled={unavailable} onClick={() => { add(product); recordActivity('add_to_cart', product.id) }}>{unavailable ? 'Sold out' : 'ADD'}</button>}
      </div>
    </div>
  </article>
}

export function ProductImage({ product }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const source = productImageSource(product)
  return source && failedUrl !== source ? <img className="catalogue-product-photo" src={source} alt={product.name} loading="lazy" decoding="async" onError={() => setFailedUrl(source)} /> : <span className="product-placeholder" role="img" aria-label={`Photo unavailable for ${product.name}`}><PackageOpen size={32} aria-hidden="true" /><small>Photo coming soon</small></span>
}
