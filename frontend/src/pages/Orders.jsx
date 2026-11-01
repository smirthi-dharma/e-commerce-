import InvoiceActions from '../components/InvoiceActions'
import ReorderButton from '../components/ReorderButton'
import '../order-tracking.css'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState, Loading } from '../components/Shared'
import api, { errorMessage } from '../services/api'

const labels = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
}
const cancelable = ['pending', 'confirmed', 'processing', 'packed', 'picked_up']
const list = (data) => (Array.isArray(data) ? data : data?.results || [])

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [returns, setReturns] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [returnFor, setReturnFor] = useState('')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [params] = useSearchParams()
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ next: null, previous: null })
  const load = async () => {
    const [orderResponse, returnResponse] = await Promise.all([
      api.get('/orders/', { params: { page } }),
      api.get('/account/returns/')
    ])
    setOrders(list(orderResponse.data))
    setPagination({ next: orderResponse.data.next, previous: orderResponse.data.previous })
    setReturns(list(returnResponse.data))
  }
  useEffect(() => {
    load()
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [page])
  const cancel = async (order) => {
    if (!window.confirm(`Cancel order ${order.order_number}?`)) return
    setBusy(order.id)
    setError('')
    setNotice('')
    try {
      await api.post(`/orders/${order.id}/cancel/`, { expected_version: order.status_version })
      setNotice(`Order ${order.order_number} was cancelled.`)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy('')
    }
  }
  const submitReturn = async (event, order) => {
    event.preventDefault()
    setBusy(order.id)
    setError('')
    try {
      await api.post('/account/returns/', { order: order.id, reason })
      setReason('')
      setReturnFor('')
      setNotice(`Return request submitted for ${order.order_number}.`)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy('')
    }
  }
  const placedOrder = orders.find((order) => order.order_number === params.get('placed'))
  return (
    <section className="wrap section orders-page">
      <span className="eyebrow">YOUR ACCOUNT</span>
      <h1>Orders</h1>
      {params.get('placed') && (
        <div className="notice success">
          Order placed successfully. Your order number is <strong>{params.get('placed')}</strong>.
        </div>
      )}
      {placedOrder && (
        <div className="summary-card order-confirmation-summary">
          <h2>Order total</h2>
          <div className="summary-line">
            <span>Merchandise subtotal</span>
            <strong>₹{Number(placedOrder.subtotal).toFixed(2)}</strong>
          </div>
          {Number(placedOrder.discount_amount) > 0 && (
            <div className="summary-line">
              <span>Product/coupon discounts</span>
              <strong>−₹{Number(placedOrder.discount_amount).toFixed(2)}</strong>
            </div>
          )}
          <div className="summary-line">
            <span>Delivery fee</span>
            <strong>
              {Number(placedOrder.delivery_fee) ? `₹${Number(placedOrder.delivery_fee).toFixed(2)}` : 'Free'}
            </strong>
          </div>
          <div className="summary-total">
            <span>Cash on delivery</span>
            <strong>₹{Number(placedOrder.amount_due ?? placedOrder.total).toFixed(2)}</strong>
          </div>
        </div>
      )}
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      {error && <ErrorState message={error} />}
      {loading ? (
        <Loading />
      ) : orders.length ? (
        <div className="orders-list">
          {orders.map((order) => {
            const returnRequest = returns.find((entry) => entry.order === order.id)
            return (
              <article className="order-card" key={order.id}>
                <div className="order-card-head">
                  <div>
                    <span className="eyebrow">ORDER {order.order_number}</span>
                    <small>{new Date(order.created_at).toLocaleDateString()}</small>
                  </div>
                  <span className={`status status-${order.status}`}>{labels[order.status]}</span>
                </div>
                <div className="order-items-preview">
                  {order.items.map((item, index) => (
                    <span key={`${item.sku}-${index}`}>
                      {item.product_name} × {item.quantity}
                    </span>
                  ))}
                </div>
                <div className="order-cost-breakdown">
                  <span>Merchandise ₹{Number(order.subtotal).toFixed(2)}</span>
                  {Number(order.discount_amount) > 0 && (
                    <span>Discount −₹{Number(order.discount_amount).toFixed(2)}</span>
                  )}
                  <span>
                    Delivery{' '}
                    {Number(order.delivery_fee) ? `₹${Number(order.delivery_fee).toFixed(2)}` : 'Free'}
                  </span>
                  <span>Wallet ₹{Number(order.wallet_amount || 0).toFixed(2)}</span>
                  <strong>COD ₹{Number(order.amount_due ?? order.total).toFixed(2)}</strong>
                </div>
                <div className="order-card-foot">
                  <span>
                    {order.payment_method.toUpperCase()} · {order.payment_status.toUpperCase()} · ₹
                    {Number(order.amount_due ?? order.total).toFixed(2)}
                  </span>
                  <Link to={`/orders/${order.id}`} className="text-link">
                    View details
                  </Link>
                </div>
                <div className="order-customer-actions">
                  <InvoiceActions order={order} compact /><ReorderButton order={order} />
                  {cancelable.includes(order.status) && (
                    <button
                      className="button secondary small"
                      disabled={busy === order.id}
                      onClick={() => cancel(order)}
                    >
                      {busy === order.id ? 'Working…' : 'Cancel order'}
                    </button>
                  )}
                  {order.status === 'delivered' && !returnRequest && (
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setReturnFor(returnFor === order.id ? '' : order.id)
                        setReason('')
                      }}
                    >
                      Request a return
                    </button>
                  )}
                  {returnRequest && (
                    <span className={`status status-${returnRequest.status}`}>
                      Return: {returnRequest.status}
                    </span>
                  )}
                </div>
                {returnFor === order.id && (
                  <form className="return-request-form" onSubmit={(event) => submitReturn(event, order)}>
                    <label className="field">
                      <span>Reason for return</span>
                      <textarea
                        required
                        maxLength="2000"
                        rows="3"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                    <button className="button primary small" disabled={busy === order.id}>
                      Submit return request
                    </button>
                  </form>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No orders yet</h2>
          <p>Your future orders will appear here.</p>
          <Link to="/products" className="button primary">
            Explore the shop
          </Link>
        </div>
      )}
      <nav className="admin-pagination" aria-label="Order pages">
        <button
          className="button secondary small"
          disabled={!pagination.previous || loading}
          onClick={() => {
            setLoading(true)
            setPage((value) => value - 1)
          }}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="button secondary small"
          disabled={!pagination.next || loading}
          onClick={() => {
            setLoading(true)
            setPage((value) => value + 1)
          }}
        >
          Next
        </button>
      </nav>
    </section>
  )
}
