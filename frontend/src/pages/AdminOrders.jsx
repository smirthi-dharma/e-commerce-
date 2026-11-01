import InStorePurchaseEntry from '../components/InStorePurchaseEntry'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import { ErrorState, Loading } from '../components/Shared'
import InvoiceActions from '../components/InvoiceActions'
import { orderLabels, orderMoney, orderDate } from '../utils/orderTracking'
import '../order-tracking.css'

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ count: 0, next: null, previous: null })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    api
      .get('/admin/orders/', { params: { page, ...filters }, signal: controller.signal })
      .then(({ data }) => {
        setOrders(data.results || data)
        setPagination({ count: data.count ?? data.length, next: data.next, previous: data.previous })
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, filters])
  const filterStatus = (status) => {
    setPage(1)
    setFilters((value) => ({ ...value, status }))
  }
  return (
    <section className="wrap section admin-page admin-orders-page">
      <span className="eyebrow">STORE MANAGEMENT</span>
      <h1>Orders</h1>
      <InStorePurchaseEntry onSaved={() => { setPage(1); setFilters(value => ({ ...value })) }} />
      <form
        className="admin-list-filters"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setFilters((value) => ({ ...value, search: searchInput.trim() }))
        }}
      >
        <label className="field">
          <span>Find an order</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Order number, customer or email"
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filters.status} onChange={(event) => filterStatus(event.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(orderLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary">Search</button>
      </form>
      <nav className="order-filter-chips" aria-label="Filter orders">
        {[
          ['', 'All'],
          ['pending', 'New'],
          ['out_for_delivery', 'Out for delivery'],
          ['delivered', 'Delivered'],
          ['cancelled', 'Cancelled']
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filters.status === value}
            onClick={() => filterStatus(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && <ErrorState message={error} />}
      {loading ? (
        <Loading />
      ) : orders.length ? (
        <div className="orders-list">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-card-head">
                <div>
                  <Link className="text-link" to={`/admin/orders/${order.id}`}>
                    {order.order_number}
                  </Link>
                  <small>
                    {order.customer_name} · {orderDate(order.created_at)}
                  </small>
                </div>
                <span className={`status status-${order.status}`}>{orderLabels[order.status]}</span>
              </div>
              <p className="admin-order-lines">
                {order.source === 'in_store' && `In-store · Bill ${order.bill_number} · ${order.purchase_date}`}
                {order.items
                  .slice(0, 2)
                  .map((item) => `${item.product_name} × ${item.quantity}`)
                  .join(' · ')}
                {order.items.length > 2 ? ` · +${order.items.length - 2} more` : ''}
              </p>
              <div className="order-card-foot">
                <strong>
                  {orderMoney(order.total)} · {order.items.reduce((sum, item) => sum + item.quantity, 0)}{' '}
                  items
                </strong>
                <Link className="button primary small" to={`/admin/orders/${order.id}`}>
                  {order.status === 'cancelled' ? 'Details / restore' : 'Manage order'}
                </Link>
              </div>
              <InvoiceActions order={order} admin compact />
            </article>
          ))}
        </div>
      ) : (
        !error && <p className="muted">No orders match these filters.</p>
      )}
      <nav className="admin-pagination" aria-label="Order pages">
        <span>
          {pagination.count} orders · page {page}
        </span>
        <div>
          <button
            type="button"
            className="button secondary small"
            disabled={loading || !pagination.previous}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="button secondary small"
            disabled={loading || !pagination.next}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </nav>
    </section>
  )
}
