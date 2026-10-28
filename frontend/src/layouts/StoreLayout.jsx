import StoreLogo from '../components/StoreLogo'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Gift, Leaf, Menu, ShoppingBasket, UserRound, WalletCards, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import CartDrawer from '../components/CartDrawer'
import MobileBottomNavigation from '../components/MobileBottomNavigation'
import PolicyLink from '../components/PolicyLink'
import { StoreSearch, DeliveryPicker, money } from '../components/StorefrontTools'
import '../storefront.css'
import '../video-storefront.css'
import '../quick-commerce.css'
import '../reference-storefront.css'
import '../responsive.css'
import '../commerce.css'
import api, { errorMessage } from '../services/api'

const PolicyPage = lazy(() => import('../pages/PolicyPage'))

export default function StoreLayout() {
  const { user, logout } = useAuth()
  const cart = useCart()
  const [cartOpen, setCartOpen] = useState(false)
  const [wallet, setWallet] = useState(null)
  const [walletError, setWalletError] = useState('')
  const [walletRefresh, setWalletRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setWallet(null); setWalletError('')
    if (!user) return () => controller.abort()
    api.get('/referrals/me/wallet/', {signal:controller.signal}).then(({data}) => { if (!controller.signal.aborted) setWallet(data) }).catch(() => { if (!controller.signal.aborted) setWalletError('Your wallet could not be loaded. Please try again.') })
    return () => controller.abort()
  }, [user, walletRefresh])
  const [categories, setCategories] = useState([])
  const [categoryError, setCategoryError] = useState('')
  const [categoryRetry, setCategoryRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setCategoryError('')
    api.get('/categories/', { signal: controller.signal }).then(({ data }) => setCategories(data.results || data)).catch(e => { if (!controller.signal.aborted) setCategoryError(errorMessage(e)) })
    return () => controller.abort()
  }, [categoryRetry])
  const [menuOpen, setMenuOpen] = useState(false)
  const [storeSettingsError, setStoreSettingsError] = useState('')
  const [openPolicy, setOpenPolicy] = useState(null)
  const policyTrigger = useRef(null)
  const [store, setStore] = useState({ store_name: 'Pandiyan Stores', store_location: 'Theni, Tamil Nadu, India', contact_phone: '8072661435', business_hours: 'Every day, 9:00 AM to 9:00 PM', free_delivery_threshold: 1000 })
  const navigate = useNavigate()
  const location = useLocation()
  const { count, subtotal } = cart
  useEffect(() => { setMenuOpen(false); setCartOpen(false) }, [location.key])
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname, location.search])
  useEffect(() => {
    const showPolicy = (event) => {
      if (!document.activeElement?.closest('.policy-modal')) {
        policyTrigger.current = document.activeElement
      }
      setCartOpen(false)
      setOpenPolicy(event.detail?.policy || null)
    }
    window.addEventListener('store:open-policy', showPolicy)
    return () => window.removeEventListener('store:open-policy', showPolicy)
  }, [])
  useEffect(() => {
    if (!openPolicy) {
      policyTrigger.current?.focus?.()
      return undefined
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [openPolicy])
  useEffect(() => {
    const loadSettings = event => api.get('/system-settings/public/', { params:{ pin:event?.detail?.pin } }).then(({ data }) => { setStore((current) => ({ ...current, ...data })); setStoreSettingsError('') }).catch(() => setStoreSettingsError('Store information could not be refreshed.'))
    loadSettings()
    window.addEventListener('store:delivery-changed', loadSettings)
    return () => window.removeEventListener('store:delivery-changed', loadSettings)
  }, [])
  const personal = location.pathname === '/account' || location.pathname === '/wallet'
  const showBasket = count > 0 && !['/cart', '/demo-basket', '/checkout', '/login', '/register', '/account', '/wallet'].includes(location.pathname)
  return <div className={`pandiyan-store quick-store${personal ? ' personal-layout' : ''}${showBasket ? ' has-basket' : ''}`}>
    <a href="#store-content" className="skip-link">Skip to shopping</a>
    <div className="announcement"><Leaf size={13} /> A little closer to home. <span>Free delivery above ₹{Number(store.free_delivery_threshold).toLocaleString('en-IN')} <span>·</span> Theni, Tamil Nadu</span></div>
    <header className="site-header">
      <div className="header-main wrap">
        <Link to="/" className="brand"><span className="store-emblem"><StoreLogo /></span><span>Pandiyan<span className="brand-store">stores</span><small>YOUR EVERYDAY, DELIVERED</small></span></Link>
        <Link to="/referrals" className="mobile-referral-cta"><Gift size={17} /><span>Refer & Earn</span></Link><DeliveryPicker store={store} unavailable={Boolean(storeSettingsError)} />
        <StoreSearch />
        <div className="header-actions"><Link to="/wallet" className="header-wallet" aria-label="Open wallet"><WalletCards size={21} /><small>{user ? (wallet ? money(wallet.balance) : '—') : 'Wallet'}</small></Link>
          <Link to="/account" className="account-action" aria-label="Open profile"><UserRound size={20} /><span>{user ? user.first_name || 'Account' : 'Sign in'}</span></Link>
          <button type="button" onClick={() => setCartOpen(true)} className="cart-action" aria-haspopup="dialog" aria-label={`Open cart with ${count} items`}><ShoppingBasket size={21} /><span>My cart<small aria-live="polite">{count ? `${count} ${count === 1 ? 'item' : 'items'} · ${money(subtotal)}` : 'Your next good thing'}</small></span></button>
        </div>
        <button className="mobile-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}<span>{menuOpen ? 'Close' : 'Menu'}</span></button>
      </div>
      <nav id="primary-navigation" className={`main-nav${menuOpen ? ' is-open' : ''}`}><div className="wrap nav-content">
        <NavLink to="/" end>Home</NavLink><NavLink onClick={() => setMenuOpen(false)} to="/products">Shop all</NavLink><NavLink to="/categories">Categories</NavLink>{categories.slice(0, 4).map((category) => <Link key={category.id} onClick={() => setMenuOpen(false)} to={`/products?category=${category.id}`}>{category.name}</Link>)}<NavLink className="nav-referral" onClick={() => setMenuOpen(false)} to="/referrals"><Gift size={17} /><span>Refer & Earn</span><span aria-hidden="true">↗</span></NavLink>
        {user && <button className="nav-logout" onClick={() => logout().finally(() => navigate('/'))}>Sign out</button>}
      </div></nav>
    </header>
    <main id="store-content"><Outlet context={{wallet, walletError, store, categories, categoryError, refreshCategories:() => setCategoryRetry(v => v + 1), refreshWallet:() => setWalletRefresh(value => value + 1)}} /></main>
    <footer className="footer"><div className="wrap footer-grid"><div><Link to="/" className="brand footer-brand"><span className="store-emblem"><StoreLogo /></span><span>Pandiyan Stores<small>{store.store_location}</small></span></Link><p>Everyday essentials for you and your family.</p></div><div><strong>Shop</strong><Link to="/products">All products</Link>{categories.slice(0, 3).map((category) => <Link key={category.id} to={`/products?category=${category.id}`}>{category.name}</Link>)}</div><div><strong>Customer care</strong><Link to="/account">My account</Link><Link to="/orders">Track an order</Link><Link to="/referrals">Invite friends</Link><PolicyLink policy="delivery">Delivery policy</PolicyLink></div><div><strong>Store policies</strong><PolicyLink policy="terms">Terms &amp; Conditions</PolicyLink><PolicyLink policy="privacy">Privacy Policy</PolicyLink><PolicyLink policy="delivery">Delivery Policy</PolicyLink><PolicyLink policy="returns">Return &amp; Refund Policy</PolicyLink><PolicyLink policy="ugc">User-Generated Content Policy</PolicyLink><Link to="/delete-account">Delete your account</Link></div><div><strong>Contact</strong><span>{store.store_location}</span><a href={`tel:${store.contact_phone}`}>{store.contact_phone}</a><span>{store.business_hours}</span>{storeSettingsError && <small role="status">{storeSettingsError}</small>}</div></div><div className="wrap footer-bottom">© {new Date().getFullYear()} Pandiyan Stores <span>Here for your every day</span></div></footer>
    {showBasket && <button type="button" className="floating-basket" onClick={() => setCartOpen(true)}><ShoppingBasket size={22} /><span><strong aria-live="polite">{count} {count === 1 ? 'item' : 'items'} · {money(subtotal)}</strong><small>Delivery calculated at checkout</small></span><b>View cart →</b></button>}
    <MobileBottomNavigation onCart={() => setCartOpen(true)} />
    <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    {openPolicy && <Suspense fallback={<div className="policy-modal-backdrop"><div className="policy-modal-loading" role="status">Loading policy…</div></div>}><PolicyPage policy={openPolicy} modal onClose={() => setOpenPolicy(null)} /></Suspense>}
  </div>
}
