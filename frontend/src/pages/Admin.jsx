import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, ArrowUpRight, Banknote, ClipboardList, PackageCheck, Plus, Users } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { errorMessage } from '../services/api'
import { ErrorState, Loading } from '../components/Shared'
import { canAccessAdminModule } from '../utils/adminAccess'

const periods = [
  ['all_time', 'All time'],
  ['today', 'Today'],
  ['last_7_days', 'Last 7 days'],
  ['last_30_days', 'Last 30 days'],
  ['this_month', 'This month'],
  ['custom', 'Custom Date Range'],
]

export default function Admin() {
  const { user } = useAuth()
  const managerHome = (user?.admin_modules || []).map((module) => ({
    orders: '/admin/orders',
    products: '/admin/products',
    inventory: '/admin/services/inventory',
    customers: '/admin/customers',
    delivery: '/admin/services/delivery',
    support: '/admin/services/support',
    returns: '/admin/services/returns',
    referrals: '/admin/referrals',
    coupons: '/admin/services/coupons',
    promotions: '/admin/services/promotions',
    reports: '/admin/services/reports',
    payments: '/admin/services/payments',
    refunds: '/admin/services/refunds',
    blogs: '/admin/services/blogs',
  }[module])).find(Boolean)
  const [period, setPeriod] = useState('last_30_days')
  const [range, setRange] = useState({ start: '', end: '' })
  const [reportParams, setReportParams] = useState({ period: 'last_30_days' })
  const [rangeError, setRangeError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState(null)
  const [today, setToday] = useState(null)
  const [allTime, setAllTime] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!['admin', 'super_admin'].includes(user?.role)) return
    let active = true
    setError('')
    setRefreshing(true)
    Promise.all([
      api.get('/admin/dashboard/', { params: reportParams }),
      api.get('/admin/dashboard/', { params: { period: 'today' } }),
      api.get('/admin/dashboard/', { params: { period: 'all_time' } }),
    ])
      .then(([current, todayResponse, allTimeResponse]) => {
        if (!active) return
        setData(current.data)
        setToday(todayResponse.data)
        setAllTime(allTimeResponse.data)
      })
      .catch((e) => { if (active) setError(errorMessage(e)) })
      .finally(() => { if (active) setRefreshing(false) })
    return () => { active = false }
  }, [reportParams, user?.role])
  const applyRange = (event) => {
    event.preventDefault()
    if (!range.start || !range.end || range.start > range.end) {
      setRangeError('Choose a start date and an end date on or after the start date.')
      return
    }
    setRangeError('')
    setReportParams({ period: 'custom', ...range })
  }
  if (!['admin', 'super_admin'].includes(user?.role)) return managerHome ? <Navigate to={managerHome} replace /> : <Navigate to="/" replace />
  if (error && !data) return <section className="wrap section"><ErrorState message={error} /></section>
  if (!data) return <Loading label="Loading store dashboard…" />

  const metrics = [
    ...(data.financials_available ? [
      ['Order value today', `₹${Number(today?.gross_sales || 0).toFixed(2)}`, Banknote, 'today'],
      ['Total order value', `₹${Number(allTime?.gross_sales || 0).toFixed(2)}`, Banknote, 'revenue'],
    ] : []),
    ['Total orders', allTime?.orders ?? '—', ClipboardList, 'orders'],
    ['Open orders', (allTime?.awaiting_confirmation || 0) + (allTime?.confirmed_orders || 0) + (allTime?.processing_orders || 0) + (allTime?.out_for_delivery || 0), PackageCheck, 'orders'],
    ['Customers', allTime?.customers ?? '—', Users, 'customers'],
    ['Low stock', allTime?.low_stock_products ?? '—', AlertTriangle, 'inventory'],
  ]
  const metricLink = (key) => {
    if (key === 'today' || key === 'revenue') {
      if (canAccessAdminModule(user, 'orders')) return '/admin/orders'
      return canAccessAdminModule(user, 'reports') ? '/admin/services/reports' : null
    }
    if (key === 'orders') return canAccessAdminModule(user, 'orders') ? '/admin/orders' : null
    if (key === 'customers') return canAccessAdminModule(user, 'customers') ? '/admin/customers' : null
    if (key === 'inventory') {
      if (canAccessAdminModule(user, 'inventory')) return '/admin/services/inventory'
      return canAccessAdminModule(user, 'products') ? '/admin/products' : null
    }
    return null
  }
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const periodLabel = data.period === 'custom'
    ? `${new Date(data.range.start).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} – ${new Date(new Date(data.range.end).getTime() - 1).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    : periods.find(([value]) => value === data.period)?.[1] || 'Last 30 days'
  const quickActions = [
    ...(canAccessAdminModule(user, 'orders') ? [['/admin/orders', 'Manage orders', ArrowRight]] : []),
    ...(canAccessAdminModule(user, 'products') ? [['/admin/products', 'Add a product', Plus]] : []),
    ...(canAccessAdminModule(user, 'inventory') ? [['/admin/services/inventory', 'Update stock', PackageCheck]] : []),
  ]
  return <section className="wrap section admin-page admin-dashboard">
    <div className="admin-dashboard-welcome">
      <div className="admin-dashboard-welcome-copy">
        <span className="admin-dashboard-kicker">PANDIYAN STORES · ADMIN OVERVIEW</span>
        <h1>{greeting}, {user?.first_name || 'Store admin'}</h1>
        <p>Your store at a glance. Here’s what’s happening {periodLabel.toLowerCase()}.</p>
        <nav className="admin-dashboard-actions" aria-label="Quick actions">{quickActions.map(([to, label, Icon]) => <Link to={to} key={to}><Icon size={15} />{label}</Link>)}</nav>
      </div>
      <div className="admin-dashboard-period">
        <span>REPORTING PERIOD</span>
        <label className="field admin-period"><select aria-label="Reporting period" value={period} onChange={(event) => { const value = event.target.value; setPeriod(value); setRangeError(''); if (value !== 'custom') setReportParams({ period: value }) }}>{periods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {period === 'custom' && <form className="admin-custom-range" onSubmit={applyRange}>
          <label className="field"><span>Start date</span><input type="date" required max={range.end || undefined} value={range.start} onChange={(event) => { setRange({ ...range, start: event.target.value }); setRangeError('') }} /></label>
          <label className="field"><span>End date</span><input type="date" required min={range.start || undefined} value={range.end} onChange={(event) => { setRange({ ...range, end: event.target.value }); setRangeError('') }} /></label>
          <small>Includes both start and end dates.</small>
          {rangeError && <p role="alert">{rangeError}</p>}
          <button className="button primary" disabled={refreshing}>Apply date range</button>
        </form>}
        <span role="status" aria-live="polite">{refreshing ? 'Updating report…' : `Showing: ${periodLabel}`}</span>
        <small>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date())}</small>
      </div>
    </div>
    {error && <ErrorState message={error} />}
    <div className="admin-metrics">{metrics.map(([label, value, Icon, key]) => {
      const target = metricLink(key)
      const card = <><span className="admin-metric-icon"><Icon size={18} /></span><span>{label}</span><strong>{value}</strong><small>{key === 'today' ? 'Today' : key === 'revenue' ? 'All time' : 'View details'} <ArrowUpRight size={13} /></small></>
      return target ? <Link to={target} className="admin-metric-card" key={label}>{card}</Link> : <article className="admin-metric-card" key={label}>{card}</article>
    })}</div>
    <section className="admin-dashboard-panel wallet-summary"><h2>Customers and referral wallet · {periodLabel}</h2><p>Customer counts describe registrations and delivered purchases, not website visits.</p><div className="admin-metrics"><article className="admin-metric-card"><span>New customers today</span><strong>{today?.new_customers || 0}</strong></article><article className="admin-metric-card"><span>New customers in period</span><strong>{data.new_customers}</strong></article>{data.financials_available && <><article className="admin-metric-card"><span>Purchasing customers</span><strong>{data.purchasing_customers}</strong></article>{[['Delivered sales', data.delivered_sales], ['Cash collected', data.cash_collected], ['Referral credits', data.referral_financials?.referral_credits], ['Referral reversals', data.referral_financials?.referral_reversals], ['Wallet used', data.referral_financials?.wallet_redeemed], ['Wallet restored', data.referral_financials?.wallet_restored], ['Outstanding wallet · all time', data.wallet_outstanding]].map(([label, value]) => <article key={label} className="admin-metric-card"><span>{label}</span><strong>₹{Number(value || 0).toFixed(2)}</strong></article>)}</>}</div></section>
    <section className="admin-dashboard-panel"><h2>Shopping activity · {periodLabel}</h2><p>Aggregate action counts, not unique visitors or conversion rates.</p><div className="admin-metrics">{[['product_view','Product views'],['add_to_cart','Add-to-cart actions'],['search','Searches'],['empty_search','Searches without results'],['checkout','Checkout visits']].map(([key,label]) => <article className="admin-metric-card" key={key}><span>{label}</span><strong>{data.shopping_activity?.[key] || 0}</strong></article>)}</div></section>
    <div className="admin-dashboard-subheading"><div><span className="eyebrow">STORE PULSE</span><h2>What needs your attention</h2></div><span>All-time order activity</span></div>
    <div className="admin-dashboard-grid">
    <section className="admin-dashboard-panel"><div className="admin-panel-heading"><div><span className="eyebrow">ORDERS</span><h2>Status overview</h2></div><Link to="/admin/orders">View all <ArrowUpRight size={14} /></Link></div><div className="admin-status-list">
      {[
        ['Awaiting confirmation', allTime?.awaiting_confirmation],
        ['Confirmed', allTime?.confirmed_orders],
        ['Processing', allTime?.processing_orders],
        ['Out for delivery', allTime?.out_for_delivery],
        ['Delivered', allTime?.delivered_orders],
        ['Cancelled', allTime?.cancelled_orders],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}
    </div></section>
    {data.financials_available && <section className="admin-dashboard-panel"><div className="admin-panel-heading"><div><span className="eyebrow">BEST SELLERS</span><h2>Top products</h2></div><Link to="/admin/products">Products <ArrowUpRight size={14} /></Link></div>{data.top_products.length ? <div className="admin-compact-list">{data.top_products.map((item, index) => <article key={item.product_name}><span className="admin-rank">{index + 1}</span><span className="admin-compact-main"><strong>{item.product_name}</strong><small>{item.quantity} units sold</small></span>{item.revenue !== undefined && <strong>₹{Number(item.revenue).toFixed(2)}</strong>}</article>)}</div> : <p className="muted">No product sales in this period.</p>}</section>}
    <section className="admin-dashboard-panel admin-recent-orders"><div className="admin-panel-heading"><div><span className="eyebrow">LATEST ACTIVITY</span><h2>Recent orders</h2></div><Link to="/admin/orders">View all <ArrowUpRight size={14} /></Link></div>{data.recent_orders.length ? <div className="admin-compact-list">{data.recent_orders.map((order) => <article key={order.id}><span className="admin-compact-main"><strong>{order.order_number}</strong><small>{new Date(order.created_at).toLocaleDateString()}</small></span><span className={`status status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span>{order.total !== undefined && <strong>₹{Number(order.total).toFixed(2)}</strong>}</article>)}</div> : <p className="muted">No orders have been placed in this period.</p>}</section>
    {data.financials_available && <section className="admin-dashboard-panel admin-sales-summary"><div className="admin-panel-heading"><div><span className="eyebrow">SALES SUMMARY</span><h2>{periodLabel}</h2></div></div><div className="admin-sales-numbers"><article><span>Order value (includes uncollected COD)</span><strong>₹{Number(data.gross_sales).toFixed(2)}</strong></article><article><span>Order value less refunds</span><strong>₹{Number(data.net_sales).toFixed(2)}</strong></article><article><span>Recorded refunds</span><strong>₹{Number(data.refund_total).toFixed(2)}</strong></article><article><span>Average order</span><strong>₹{Number(data.average_order_value).toFixed(2)}</strong></article></div></section>}
    </div>
    {['admin', 'super_admin'].includes(user?.role) && <nav className="admin-dashboard-tools" aria-label="Developer tools"><a href="http://localhost:8000/django-admin/" target="_blank" rel="noreferrer">Django administration <ArrowUpRight size={13} /></a><a href="http://localhost:8000/api/schema/swagger-ui/" target="_blank" rel="noreferrer">API documentation <ArrowUpRight size={13} /></a></nav>}
  </section>
}
