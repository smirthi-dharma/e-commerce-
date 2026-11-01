import { useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import { useCart } from '../context/CartContext'

export default function ReorderButton({ order }) {
  const cart = useCart()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const reorder = async () => {
    setBusy(true); setMessage('')
    try {
      const ids = order.items.map(item => item.product_id).filter(Boolean)
      if (!ids.length) { setMessage('These products are no longer listed.'); return }
      const { data } = await api.get('/products/', { params: { ids: ids.join(','), page_size: 100 } })
      const products = data.results || data
      products.forEach(product => cart.add(product, Math.min(product.stock, order.items.find(item => item.product_id === product.id)?.quantity || 1)))
      setMessage(products.length ? 'Available items added at current prices. Review quantities in your basket.' : 'These products are currently unavailable.')
    } catch (exception) { setMessage(errorMessage(exception)) } finally { setBusy(false) }
  }
  return <div><button type="button" className="button secondary small" disabled={busy} onClick={reorder}>{busy ? 'Checking stock…' : 'Buy again'}</button>{message && <p role="status">{message} <Link to="/cart">View basket</Link></p>}</div>
}
