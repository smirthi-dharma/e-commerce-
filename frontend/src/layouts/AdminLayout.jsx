import {
  ArrowUpRight, Bell, BookOpen, Boxes, ChevronRight, ClipboardList, CreditCard,
  Gift, Headset, LayoutDashboard, LogOut, Megaphone, MessageSquare, MoreHorizontal, PackageCheck,
  RotateCcw, Settings2, ShieldCheck, Store, Users, Wallet, X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { canAccessAdminModule } from '../utils/adminAccess'

const navigation = [
  [LayoutDashboard, 'Dashboard', '/admin', null, true],
  [ClipboardList, 'Orders', '/admin/orders', 'orders'],
  [Boxes, 'Products & categories', '/admin/products', 'products'],
  [PackageCheck, 'Inventory', '/admin/services/inventory', 'inventory'],
  [Users, 'Customers', '/admin/customers', 'customers'],
  [CreditCard, 'Payments', '/admin/services/payments', 'payments'],
  [RotateCcw, 'Refunds', '/admin/services/refunds', 'refunds'],
  [Megaphone, 'Coupons', '/admin/services/coupons', 'coupons'],
  [Megaphone, 'Promotions', '/admin/services/promotions', 'promotions'],
  [Gift, 'Referral management', '/admin/referrals', 'referrals'],
  [Headset, 'Support requests', '/admin/services/support', 'support'],
  [MessageSquare, 'Customer questions', '/admin/services/questions', 'support'],
  [MessageSquare, 'Customer requests', '/admin/services/requests', 'support'],
  [RotateCcw, 'Returns', '/admin/services/returns', 'returns'],
  [BookOpen, 'Blog management', '/admin/services/blogs', 'blogs'],
  [Wallet, 'Reseller commissions', '/admin/services/commissions', 'reseller-finance'],
  [Settings2, 'Store settings', '/admin/services/settings', null, false, ['admin', 'super_admin']],
  [ClipboardList, 'Reports', '/admin/services/reports', 'reports'],
  [ShieldCheck, 'Staff & permissions', '/admin/staff', null, false, ['admin', 'super_admin']],
]

const primaryLinks = new Set(['/admin', '/admin/orders', '/admin/products'])

function pageTitle(pathname) {
  const item = navigation.find(([, , to]) => to !== '/admin' && (pathname === to || pathname.startsWith(`${to}/`)))
  if (item) return item[1]
  if (pathname.startsWith('/admin/referrals/network/')) return 'Referral details'
  if (pathname.startsWith('/admin/services/')) {
    const section = pathname.split('/').at(-1)
    return navigation.find(([, , to]) => to.endsWith(`/${section}`))?.[1] || 'Store operations'
  }
  return 'Dashboard'
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [pendingOrders, setPendingOrders] = useState(null)
  const [notificationError, setNotificationError] = useState(false)
  const isSeniorAdmin = ['admin', 'super_admin'].includes(user?.role)
  const links = navigation.filter(([, , , module, overview, roles]) => {
    if (roles) return roles.includes(user?.role)
    if (overview) return isSeniorAdmin
    return canAccessAdminModule(user, module)
  })
  const extras = links.filter(([, , to]) => !primaryLinks.has(to))

  useEffect(() => {
    setMoreOpen(false)
    setProfileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isSeniorAdmin) {
      setPendingOrders(null)
      setNotificationError(false)
      return
    }
    const loadNotifications = () => api.get('/admin/dashboard/?period=all_time')
      .then(({ data }) => {
        setPendingOrders((data.awaiting_confirmation || 0) + (data.confirmed_orders || 0) + (data.processing_orders || 0) + (data.out_for_delivery || 0))
        setNotificationError(false)
      })
      .catch(() => {
        setPendingOrders(null)
        setNotificationError(true)
      })
    loadNotifications()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') loadNotifications() }, 15000)
    return () => clearInterval(timer)
  }, [location.pathname, isSeniorAdmin])

  const signOut = () => logout().finally(() => navigate('/login'))
  const title = pageTitle(location.pathname)

  return <div className="admin-shell">
    <aside className="admin-shell-sidebar">
      <Link to="/admin" className="admin-shell-brand"><span className="admin-shell-mark"><Store size={21} /></span><span>Pandiyan Stores<small>Store administration</small></span></Link>
      <span className="admin-shell-label">WORKSPACE</span>
      <nav className="admin-shell-nav" aria-label="Administration">
        {links.map(([Icon, label, to, , overview]) => <NavLink end={overview} to={to} key={to} className={({ isActive }) => `admin-shell-link${isActive ? ' is-active' : ''}`}><Icon size={17} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="admin-shell-sidebar-foot"><span className="admin-avatar">{(user?.first_name || user?.email || 'A').slice(0, 1).toUpperCase()}</span><span className="admin-user"><strong>{user?.first_name || user?.email}</strong><small>{user?.role?.replaceAll('_', ' ')}</small></span></div>
    </aside>
    <div className="admin-shell-workspace">
      <header className="admin-shell-header">
        <div className="admin-header-title"><span>PANDIYAN STORES</span><strong>{title}</strong></div>
        <div className="admin-header-actions">
          {isSeniorAdmin && <Link to="/admin/orders" className={`admin-notifications${notificationError ? ' has-error' : ''}`} aria-label={notificationError ? 'Notifications unavailable' : `${pendingOrders ?? 0} pending orders`} title={notificationError ? 'Notifications unavailable' : `${pendingOrders ?? 0} pending orders`}>
            <Bell size={19} />
            {pendingOrders > 0 && <span className="admin-notification-count">{pendingOrders > 99 ? '99+' : pendingOrders}</span>}
            {notificationError && <span className="admin-notification-error" />}
          </Link>}
          <Link to="/" className="admin-store-link"><ArrowUpRight size={16} /><span>Storefront</span></Link>
          <div className="admin-profile">
            <button className="admin-profile-button" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>
              <span className="admin-avatar">{(user?.first_name || user?.email || 'A').slice(0, 1).toUpperCase()}</span>
              <span className="admin-profile-name"><strong>{user?.first_name || user?.email}</strong><small>{user?.role?.replaceAll('_', ' ')}</small></span>
            </button>
            {profileOpen && <div className="admin-profile-menu"><Link to="/">View storefront <ArrowUpRight size={15} /></Link><button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button></div>}
          </div>
          <button type="button" className="admin-logout admin-desktop-logout" onClick={signOut}><LogOut size={16} /><span>Sign out</span></button>
        </div>
      </header>
      <main className="admin-shell-content"><Outlet /></main>
    </div>
    {moreOpen && <div className="admin-more-overlay" onClick={() => setMoreOpen(false)}>
      <section className="admin-more-sheet" role="dialog" aria-modal="true" aria-label="More administration" onClick={(event) => event.stopPropagation()}>
        <div className="admin-more-heading"><span><small>PANDIYAN STORES</small><strong>More tools</strong></span><button type="button" aria-label="Close more menu" onClick={() => setMoreOpen(false)}><X size={20} /></button></div>
        <nav className="admin-more-grid" aria-label="More administration tools">
          {extras.map(([Icon, label, to]) => <Link to={to} key={to}><span><Icon size={19} /></span><strong>{label}</strong><ChevronRight size={16} /></Link>)}
        </nav>
        <button type="button" className="admin-more-signout" onClick={signOut}><LogOut size={17} /> Sign out</button>
      </section>
    </div>}
    <nav className="admin-mobile-nav" aria-label="Primary administration">
      {navigation.filter(([, , to]) => primaryLinks.has(to)).map(([Icon, label, to, , overview]) => <NavLink end={overview} to={to} key={to} className={({ isActive }) => `admin-mobile-link${isActive ? ' is-active' : ''}`}><Icon size={19} /><span>{label}</span></NavLink>)}
      <button type="button" className={`admin-mobile-link${moreOpen ? ' is-active' : ''}`} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={19} /><span>More</span></button>
    </nav>
  </div>
}
