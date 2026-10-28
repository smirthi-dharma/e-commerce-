import { ArrowRight, ShoppingBag } from 'lucide-react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { ErrorState, ProductCard } from '../components/Shared'
import { ProductSkeletons } from '../components/StorefrontTools'
import CategoryVisual from '../components/CategoryVisual'
import ShoppingHero from '../components/ShoppingHero'
import StorePromotions from '../components/StorePromotions'

const rows = data => data.results || data
function Shelf({ title, caption, items, to = '/products' }) {
  if (!items.length) return null
  return <section className="quick-shelf"><div className="quick-section-heading"><div><h2>{title}</h2><p>{caption}</p></div><Link to={to}>See all <ArrowRight size={17} /></Link></div><div className="product-grid">{items.map(product => <ProductCard key={product.id} product={product} />)}</div></section>
}

export default function Home() {
  const { categories = [], store } = useOutletContext()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { if (new URLSearchParams(location.search).has('search')) navigate(`/products${location.search}`, { replace:true }) }, [location.search, navigate])
  const [data, setData] = useState({ recommended: [], deals: [], repeat: [], recent: [], banners: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    let recent = []
    try { recent = JSON.parse(localStorage.getItem('pandiyan_viewed') || '[]').filter(Number.isInteger).slice(0, 12) } catch { /* Optional browsing history. */ }
    const get = params => api.get('/products/', { params: { page_size: 6, ...params }, signal: controller.signal }).then(({ data }) => rows(data))
    Promise.allSettled([
      get({}), get({ collection: 'deals' }), user ? get({ collection: 'buy-again' }) : Promise.resolve([]),
      recent.length ? get({ ids: recent.join(',') }) : Promise.resolve([]),
      api.get('/homepage-banners/', { signal: controller.signal }).then(({ data }) => rows(data)),
    ]).then(results => {
      if (controller.signal.aborted) return
      if (results[0].status === 'rejected') setError(errorMessage(results[0].reason))
      setData(Object.fromEntries(['recommended', 'deals', 'repeat', 'recent', 'banners'].map((key, i) => [key, results[i].status === 'fulfilled' ? results[i].value : []])))
      setLoading(false)
    })
    return () => controller.abort()
  }, [user?.id, retry])
  return <div className="quick-home wrap">
    {store.accepting_orders === false && <p className="notice" role="status">{store.availability_message} You can still browse and save your basket.</p>}
    <ShoppingHero banner={data.banners[0]} />
    <section className="quick-categories" aria-labelledby="category-heading"><div className="quick-section-heading"><h2 id="category-heading">Shop by category</h2><Link to="/categories">See all <ArrowRight size={17} /></Link></div>
      <nav className="visual-categories" aria-label="Shop by category">{categories.slice(0, 8).map(category => <Link key={category.id} to={`/products?category=${category.id}`}><CategoryVisual name={category.name} imageUrl={category.image_url} /><strong>{category.name}</strong></Link>)}{!categories.length && <Link to="/products"><span className="category-visual category-all"><ShoppingBag size={30} /></span><strong>Shop all</strong></Link>}</nav>
    </section>
    {error ? <div className="shop-load-error"><ErrorState message={error} /><button className="button secondary" onClick={() => setRetry(v => v + 1)}>Try again</button></div> : loading ? <ProductSkeletons /> : !data.recommended.length ? <div className="empty-state"><ShoppingBag size={34} /><h2>We’re stocking the shelves</h2><p>Check back soon for your everyday essentials.</p></div> : <>
      <Shelf title={data.repeat.length ? 'Buy again' : 'Your everyday picks'} caption={data.repeat.length ? 'Your previous purchases, at today’s prices.' : 'Available essentials selected by your store.'} items={data.repeat.length ? data.repeat : data.recommended} to={data.repeat.length ? '/products?collection=buy-again' : '/products'} />
      <StorePromotions categories={categories} banners={data.banners.slice(1)} />
      <Shelf title="More value, every day" caption="Savings against genuine MRP or previous selling prices." items={data.deals} to="/products?collection=deals" />
      {data.repeat.length > 0 && <Shelf title="Explore your store" caption="Everyday essentials for your home." items={data.recommended} />}
      <Shelf title="Recently viewed" caption="Pick up where you left off." items={data.recent} />
    </>}
    <Link to="/referrals" className="quick-referral"><span className="referral-symbol"><ShoppingBag size={28} /></span><div><h2>Share your store. Earn rewards.</h2><p>Invite friends and see your referral rewards.</p></div><span className="referral-link">Discover rewards <ArrowRight size={18} /></span></Link>
  </div>
}
