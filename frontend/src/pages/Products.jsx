import { recordActivity } from '../services/activity'
import { ArrowRight, LayoutGrid, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ErrorState, ProductCard } from '../components/Shared'
import api, { errorMessage } from '../services/api'
import { ProductSkeletons } from '../components/StorefrontTools'
import CategoryVisual from '../components/CategoryVisual'

export default function Products() {
  const { categories = [], categoryError, refreshCategories } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalPages, setTotalPages] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [retry, setRetry] = useState(0)
  const activeCategory = categories.find(c => String(c.id) === params.get('category'))
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const timer = setTimeout(() => api.get('/products/', { params: Object.fromEntries(params.entries()), signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        const results = data.results || data
        setBrands(data.brands || [])
        if (params.get('search') && !results.length) recordActivity('empty_search')
        setTotalPages(data.total_pages || Math.max(1, Math.ceil((data.count ?? results.length) / (data.page_size || 12)))); setProducts(results); setTotal(data.count ?? results.length); setHasNext(Boolean(data.next))
      })
      .catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) }), params.get('search') ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [params, retry])
  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }
  const page = Math.max(1, Number(params.get('page')) || 1)
  return <section className="quick-catalogue wrap">
    <div className="catalogue-breadcrumb"><Link to="/">Home</Link><span>/</span><span>{activeCategory?.name || 'All products'}</span></div>
    <div className="catalogue-layout">
      <aside className="catalogue-sidebar"><div className="sidebar-heading">Shop by category</div><nav aria-label="Shop by category"><button className={!params.get('category') ? 'selected' : ''} aria-pressed={!params.get('category')} onClick={() => setParam('category', '')}><span className="category-visual category-all"><LayoutGrid size={24} /></span><span>All products</span></button>{categories.map(category => <button className={params.get('category') === String(category.id) ? 'selected' : ''} aria-pressed={params.get('category') === String(category.id)} key={category.id} onClick={() => setParam('category', String(category.id))}><CategoryVisual name={category.name} imageUrl={category.image_url} /><span>{category.name}</span></button>)}</nav>{categoryError && <button className="category-retry" onClick={refreshCategories}>Reload categories</button>}<div className="sidebar-note"><span>LOCAL STORE.<br /><b>Everyday goodness.</b></span><small>Proudly serving Theni.</small></div></aside>
      <div className="catalogue-results"><div className="catalogue-top"><div><span className="section-kicker">YOUR EVERYDAY MARKET</span><h1>{params.get('search') ? `Results for “${params.get('search')}”` : activeCategory?.name || 'All your essentials'}</h1><p aria-live="polite">{loading ? 'Finding your favourites…' : error ? 'Let’s get your shopping back on track.' : `${total} ${total === 1 ? 'product' : 'products'} to make every day a little easier.`}</p></div><label className="quick-sort"><SlidersHorizontal size={16} /><span className="sr-only">Sort products</span><select aria-label="Sort products" value={params.get('ordering') || ''} onChange={e => setParam('ordering', e.target.value)}><option value="">Recommended</option><option value="price">Price: low to high</option><option value="-price">Price: high to low</option><option value="name">Name: A to Z</option></select></label></div>
        {brands.length > 0 && <label className="brand-filter">Brand <select value={params.get('brand') || ''} onChange={event => setParam('brand', event.target.value)}><option value="">All brands</option>{brands.map(brand => <option key={brand}>{brand}</option>)}</select></label>}<div className="catalogue-collection-row"><div className="collection-chips" aria-label="Product collections">{[['', 'All products'], ['deals', 'Offers'], ['buy-again', 'Buy again'], ['fast-moving', 'Popular purchases']].map(([value, label]) => <button key={value} aria-pressed={(params.get('collection') || '') === value} onClick={() => setParam('collection', value)}>{label}</button>)}</div>{params.get('search') && <button className="clear-query" onClick={() => setParam('search', '')}><X size={14} /> Clear search</button>}</div>
        {error ? <div className="shop-load-error"><ErrorState message={error} /><button className="button secondary" onClick={() => { setRetry(v => v + 1); refreshCategories() }}>Try again</button></div> : loading ? <ProductSkeletons count={12} /> : products.length ? <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><Search size={35} /><h2>No matches this time</h2><p>Try another search or explore a different category.</p><button className="button primary" onClick={() => setParams({})}>Browse all products <ArrowRight size={16} /></button></div>}
        {!loading && !error && total > 0 && <nav className="pagination-controls" aria-label="Product pages"><button className="button secondary" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>Previous</button><span aria-live="polite">Page {page} of {totalPages}</span><button className="button secondary" disabled={!hasNext} onClick={() => setParam('page', String(page + 1))}>Next</button></nav>}
        <p className="catalogue-footnote">Your neighbourhood favourites, all in one place. Prices and availability are confirmed at checkout.</p>
      </div>
    </div>
  </section>
}
