import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Phone, CheckCircle2, Package, RotateCcw } from 'lucide-react'
import api, { errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { canAccessAdminModule } from '../utils/adminAccess'
import {
  orderLabels,
  orderStages,
  orderDate,
  orderMoney,
  historyLabel,
  customerCancelable
} from '../utils/orderTracking'
import { ErrorState, Loading } from './Shared'
import InvoiceActions from './InvoiceActions'
import ReorderButton from './ReorderButton'
import OrderAlerts from './OrderAlerts'
import PackingChecklist from './PackingChecklist'
import '../order-tracking.css'

export default function OrderWorkspace({ admin = false }) {
  const { id } = useParams()
  const { user } = useAuth()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('order')
  const [note, setNote] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const endpoint = `${admin ? '/admin' : ''}/orders/${id}/`
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setOrder(null)
    setError('')
    setTab('order')
    setConfirmation('')
    const load = async (initial) => {
      try {
        const { data } = await api.get(endpoint, { signal: controller.signal })
        if (active) {
          setOrder((current) => (current && current.status_version > data.status_version ? current : data))
          setError('')
          if (initial) setNote(data.private_note || '')
        }
      } catch (e) {
        if (active && !controller.signal.aborted) setError(errorMessage(e))
      }
    }
    load(true)
    const timer = admin
      ? null
      : setInterval(() => {
          if (document.visibilityState === 'visible' || window.Notification?.permission === 'granted') load(false)
        }, 10000)
    return () => {
      active = false
      controller.abort()
      if (timer) clearInterval(timer)
    }
  }, [endpoint, admin])
  const refresh = async () => {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.get(endpoint)
      setOrder(data)
      if (!order) setNote(data.private_note || '')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const update = async (action) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = { expected_version: order.status_version }
      const response =
        action === 'restore'
          ? await api.post(`${endpoint}restore/`, payload)
          : action === 'cancelled' && !admin
            ? await api.post(`${endpoint}cancel/`, payload)
            : await api.patch(endpoint, {
                ...payload,
                ...(action === 'note' ? { private_note: note } : { status: action })
              })
      setOrder(response.data)
      setConfirmation('')
      setNotice(
        action === 'restore'
          ? 'Cancellation reversed. The order is ready to process again.'
          : action === 'note'
            ? 'Private note saved.'
            : 'Order status updated.'
      )
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  if (!order)
    return error ? (
      <section className="wrap section">
        <ErrorState message={error} />
        <button className="button secondary" onClick={refresh}>
          Try again
        </button>
      </section>
    ) : (
      <Loading label="Loading order…" />
    )
  const forward = (order.next_statuses || []).find((status) => status !== 'cancelled')
  const cancelable = admin
    ? order.next_statuses?.includes('cancelled')
    : customerCancelable.includes(order.status)
  const current = orderStages.indexOf(order.status)
  return (
    <section className="wrap section order-workspace">
      <Link className="text-link" to={admin ? '/admin/orders' : '/orders'}>
        <ArrowLeft size={16} />
        All orders
      </Link>
      <header className="order-workspace-heading">
        <div>
          <span className="eyebrow">{admin ? 'ORDER MANAGEMENT' : 'YOUR ORDER'}</span>
          <h1>{order.order_number}</h1>
          {order.source === 'in_store' && <p>In-store purchase · Bill {order.bill_number} · {order.purchase_date}</p>}
          <p>{orderDate(order.created_at)}</p>
        </div>
        <button type="button" className="button secondary small" onClick={refresh} disabled={busy}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      <div className={`order-current order-current-${order.status}`}>
        <span>{order.status === 'delivered' ? <CheckCircle2 size={25} /> : <Package size={25} />}</span>
        <div>
          <strong>{orderLabels[order.status]}</strong>
          <small>Updated {orderDate(order.updated_at)}</small>
        </div>
      </div>
      {current >= 0 && (
        <div
          className="order-stage-track"
          aria-label={`Step ${current + 1} of ${orderStages.length}: ${orderLabels[order.status]}`}
        >
          {orderStages.map((status, index) => (
            <span key={status} className={index <= current ? 'done' : ''} title={orderLabels[status]} />
          ))}
        </div>
      )}
      {((forward && admin) || cancelable || (admin && order.status === 'cancelled')) && (
        <div className="order-status-actions">
          {confirmation ? (
            <div className="order-confirmation" role="alert">
              <p>
                {confirmation === 'restore'
                  ? 'Restore this order to Order placed? Stock will be reserved again and any returned wallet credit re-applied. Availability is checked before restoring.'
                  : 'Cancel this order? Reserved stock and any wallet payment will be returned. Cash refunds, if needed, are handled separately.'}
              </p>
              <div className="order-action-row">
                <button
                  className="button primary"
                  type="button"
                  disabled={busy}
                  onClick={() => update(confirmation)}
                >
                  {busy ? 'Saving…' : confirmation === 'restore' ? 'Confirm restore' : 'Confirm cancellation'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmation('')}
                >
                  Keep current status
                </button>
              </div>
            </div>
          ) : (
            <div className="order-action-row">
              {admin && forward && (
                <button
                  className="button primary"
                  type="button"
                  disabled={busy}
                  onClick={() => update(forward)}
                >
                  {busy ? 'Saving…' : `Mark ${orderLabels[forward].toLowerCase()}`}
                </button>
              )}
              {cancelable && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmation('cancelled')}
                >
                  Cancel order
                </button>
              )}
              {admin && order.status === 'cancelled' && (
                <button
                  className="button primary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmation('restore')}
                >
                  <RotateCcw size={16} />
                  Undo cancellation
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!admin && <div className="delivery-status">{order.estimated_delivery_latest_at && !['delivered','cancelled'].includes(order.status) && <p>Estimated arrival: {new Date(order.estimated_delivery_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}–{new Date(order.estimated_delivery_latest_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}{new Date(order.estimated_delivery_latest_at) < new Date() && ' · Taking longer than expected; contact the store for an updated time.'}</p>}<ReorderButton order={order} /><OrderAlerts order={order} /><Link className="text-link" to={`/account/support?order=${order.id}`}>Get help with this order</Link></div>}
      {admin && ['pending','confirmed','processing'].includes(order.status) && <PackingChecklist order={order} onUpdate={setOrder} />}
      <nav className="order-section-nav" aria-label="Order sections">
        {[
          ['order', 'Order details'],
          ...(admin ? [['notes', 'Private notes']] : []),
          ['invoice', 'Invoice']
        ].map(([key, label]) => (
          <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'invoice' ? (
        <section className="order-panel">
          <InvoiceActions key={id} order={order} admin={admin} onIssued={refresh} />
        </section>
      ) : tab === 'notes' ? (
        <section className="order-panel">
          <h2>Private staff note</h2>
          <p className="order-muted">
            Visible only to staff with order access. Never included in the customer view or invoice.
          </p>
          <label className="field">
            <span>Note</span>
            <textarea
              rows="5"
              maxLength="4000"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            className="button primary"
            type="button"
            disabled={busy || note === order.private_note}
            onClick={() => update('note')}
          >
            Save note
          </button>
          <h3>Customer instructions</h3>
          <p className="order-preserve">{order.instructions || 'No instructions added.'}</p>
        </section>
      ) : (
        <div className="order-workspace-grid">
          <div>
            <section className="order-panel">
              <h2>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</h2>
              {order.items.map((item, index) => (
                <div className="order-line" key={`${item.sku}-${index}`}>
                  <div className="order-line-product">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <div>
                      <strong>{item.product_name}</strong>
                      <small>
                        {item.quantity} × {orderMoney(item.unit_price)}
                      </small>
                    </div>
                  </div>
                  <b>{orderMoney(item.line_total)}</b>
                </div>
              ))}
            </section>
            <section className="order-panel">
              <h2>Delivery</h2>
              <strong>{order.customer_name}</strong>
              <p className="order-preserve">
                {order.address}
                <br />
                PIN {order.delivery_pin_code}
              </p>
              <a className="text-link" href={`tel:${order.phone}`}>
                <Phone size={15} />
                {order.phone}
              </a>
              {order.delivery && (
                <div className="order-delivery-detail">
                  <p>
                    {order.delivery.personnel_name
                      ? `Delivery partner: ${order.delivery.personnel_name}`
                      : 'Delivery partner not assigned yet'}
                  </p>
                  <p>Schedule: {orderDate(order.delivery.scheduled_at)}</p>{order.delivery.personnel_phone && <a className="text-link" href={`tel:${order.delivery.personnel_phone}`}>Call delivery partner</a>}
                  <p>Delivery status: {order.delivery.status.replaceAll('_', ' ')}</p>{order.delivery.shared_location && <a className="text-link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${order.delivery.shared_location.latitude}&mlon=${order.delivery.shared_location.longitude}#map=16/${order.delivery.shared_location.latitude}/${order.delivery.shared_location.longitude}`}>View delivery location · shared {orderDate(order.delivery.shared_location.shared_at)}</a>}
                </div>
              )}
              {admin &&
                order.delivery &&
                canAccessAdminModule(user, 'delivery') &&
                order.status !== 'cancelled' && (
                  <Link
                    className="text-link"
                    to={`/admin/services/delivery?search=${encodeURIComponent(order.order_number)}`}
                  >
                    Manage delivery options →
                  </Link>
                )}
              {!admin && order.instructions && (
                <p className="order-preserve order-muted">Instructions: {order.instructions}</p>
              )}
            </section>
            <details className="order-panel order-history">
              <summary>Tracking history</summary>
              {order.status_events?.length ? (
                <ol>
                  {order.status_events.map((event) => (
                    <li key={event.id}>
                      <strong>{historyLabel(event)}</strong>
                      <time>{orderDate(event.created_at)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="order-muted">Earlier status timestamps are unavailable.</p>
              )}
            </details>
          </div>
          <aside>
            <section className="order-panel">
              <h2>Bill summary</h2>
              {[
                ['Items', order.subtotal],
                ['Discount', -Number(order.discount_amount)],
                ['Delivery', order.delivery_fee]
              ].map(([label, value]) => (
                <div className="order-bill-line" key={label}>
                  <span>{label}</span>
                  <strong>{orderMoney(value)}</strong>
                </div>
              ))}
              <div className="order-bill-line order-bill-total">
                <span>Total</span>
                <strong>{orderMoney(order.total)}</strong>
              </div>
              <div className="order-bill-line">
                <span>Wallet applied</span>
                <strong>{orderMoney(order.wallet_amount)}</strong>
              </div>
              <div className="order-bill-line">
                <span>{order.source === 'in_store' ? 'Paid at shop' : 'COD portion'}</span>
                <strong>{orderMoney(order.source === 'in_store' ? order.total : order.amount_due)}</strong>
              </div>
              <p className="order-muted">
                Payment: {order.payment_status.replaceAll('_', ' ')}
                {order.status === 'cancelled'
                  ? ' · Order cancelled; amounts above show the original split.'
                  : ''}
              </p>
              <InvoiceActions key={id} compact order={order} admin={admin} onIssued={refresh} />
            </section>
          </aside>
        </div>
      )}
    </section>
  )
}
