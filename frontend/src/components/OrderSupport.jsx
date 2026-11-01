import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import { ErrorState } from './Shared'

export function SupportPhoto({ id, admin = false }) {
  const [error, setError] = useState('')
  const download = async () => {
    try {
      const { data } = await api.get(`/${admin ? 'admin' : 'account'}/support-tickets/${id}/photo/`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `support-${id}-photo`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (exception) { setError(errorMessage(exception)) }
  }
  return <><button type="button" className="button secondary small" onClick={download}>Download attached photo</button>{error && <p role="alert">{error}</p>}</>
}

export default function OrderSupport() {
  const [params] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [orderId, setOrderId] = useState(params.get('order') || '')
  const [order, setOrder] = useState(null)
  const [tickets, setTickets] = useState([])
  const [affected, setAffected] = useState({})
  const [form, setForm] = useState({ subject: '', message: '', issue_type: 'other' })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const loadTickets = () => api.get('/account/support-tickets/').then(({ data }) => setTickets(data.results || data))
  useEffect(() => {
    api.get('/orders/').then(({ data }) => setOrders(data.results || data)).catch(exception => setError(errorMessage(exception)))
    loadTickets().catch(exception => setError(errorMessage(exception)))
  }, [])
  useEffect(() => {
    setOrder(null); setAffected({})
    if (!orderId) return
    const controller = new AbortController()
    api.get(`/orders/${orderId}/`, { signal: controller.signal }).then(({ data }) => setOrder(data)).catch(exception => { if (!controller.signal.aborted) setError(errorMessage(exception)) })
    return () => controller.abort()
  }, [orderId])
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => body.append(key, value))
    if (orderId) body.append('order', orderId)
    body.append('affected_items', JSON.stringify(Object.entries(affected).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ item_id: Number(id), quantity }))))
    if (photo) body.append('photo', photo)
    try { await api.post('/account/support-tickets/', body); setMessage('Your request has been sent to the store. You can follow its response below.'); setForm({ subject:'', message:'', issue_type:'other' }); setPhoto(null); event.target.reset(); await loadTickets() }
    catch (exception) { setError(errorMessage(exception)) } finally { setBusy(false) }
  }
  return <section className="wrap section"><h1>Help with your order</h1><form className="form-stack" onSubmit={submit}>
    <label className="field"><span>Order (optional)</span><select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">General support</option>{orderId && !orders.some(value => value.id === orderId) && <option value={orderId}>{order?.order_number || orderId}</option>}{orders.map(value => <option key={value.id} value={value.id}>{value.order_number}</option>)}</select></label>
    <label className="field"><span>Issue</span><select value={form.issue_type} onChange={event => setForm({ ...form, issue_type:event.target.value })}>{[['missing','Missing item'],['wrong','Wrong item'],['quality','Quality issue'],['delivery','Delivery issue'],['other','Other']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {order && <fieldset><legend>Affected items</legend>{order.items.map(item => <label className="field" key={item.id}><span>{item.product_name} · ordered {item.quantity}</span><input type="number" min={0} max={item.quantity} value={affected[item.id] || 0} onChange={event => setAffected({ ...affected, [item.id]: Math.max(0, Math.min(item.quantity, Number(event.target.value))) })} /></label>)}</fieldset>}
    <label className="field"><span>Subject</span><input required maxLength={160} value={form.subject} onChange={event => setForm({ ...form, subject:event.target.value })} /></label>
    <label className="field"><span>What happened?</span><textarea required maxLength={5000} value={form.message} onChange={event => setForm({ ...form, message:event.target.value })} /></label>
    <label className="field"><span>Photo (optional, JPEG/PNG/WebP, up to 2 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setPhoto(event.target.files[0] || null)} /></label>
    {error && <ErrorState message={error} />}<button className="button primary" disabled={busy || Boolean(orderId && !order)}>{busy ? 'Sending…' : 'Send to support'}</button>
  </form>{message && <p role="status">{message}</p>}<h2>Your support requests</h2>{tickets.map(ticket => <article className="service-record" key={ticket.id}><div><h3>{ticket.ticket_number} · {ticket.subject}</h3><p>{ticket.message}</p><strong>{ticket.status.replaceAll('_',' ')}</strong>{ticket.response && <p>{ticket.response}</p>}{ticket.has_photo && <SupportPhoto id={ticket.id} />}</div></article>)}</section>
}
