import { useEffect, useState } from 'react'
import api from '../services/api'
import { ProductCard } from './Shared'

export default function BasketAlternatives({ category, excluded }) {
  const [products, setProducts] = useState([])
  useEffect(() => {
    const controller = new AbortController()
    api.get('/products/', { params:{ category, page_size:8 }, signal:controller.signal }).then(({ data }) => setProducts((data.results || data).filter(product => !excluded.split(',').includes(String(product.id))).slice(0,4))).catch(() => {})
    return () => controller.abort()
  }, [category, excluded])
  return products.length ? <section><h2>Available alternatives</h2><p>Choose a replacement and remove the unavailable item.</p><div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div></section> : null
}
