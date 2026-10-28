import { useState } from 'react'
import api, { errorMessage } from '../services/api'
import { Link } from 'react-router-dom'

export default function InStorePurchaseEntry({ onSaved }) {
  const [mode, setMode] = useState('existing')
  const [customerId, setCustomerId] = useState('')
  const [selected, setSelected] = useState(null)
  const [customer, setCustomer] = useState({ full_name: '', email: '', phone: '' })
  const [bill, setBill] = useState({ bill_number: '', purchase_date: '', amount: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  async function selectCustomer() {
    setBusy(true); setError(''); setSelected(null)
    try {
      const { data } = await api.get('/admin/orders/in-store-customer/', { params: { customer_id: customerId } })
      setSelected(data)
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setSaved(null)
    try {
      const { data } = await api.post('/admin/orders/in-store/', {
        ...bill, ...(mode === 'existing' ? { customer_id: selected.id } : { customer })
      })
      setSaved(data)
      setBill({ bill_number: '', purchase_date: '', amount: '' })
      setSelected(null); setCustomerId(''); setCustomer({ full_name: '', email: '', phone: '' })
      onSaved()
    } catch (e) {
      const details = e.response?.data
      setError(details ? JSON.stringify(details) : errorMessage(e))
    } finally { setBusy(false) }
  }
  return <details className="order-card">
    <summary><strong>In-store Purchase Entry</strong></summary>
    <p>Record a paid shop bill as a completed purchase. Enter the final bill amount; no products or additional discounts are needed.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Customer and paid bill</legend>
        <label className="field"><span>Customer</span><select value={mode} onChange={e => { setMode(e.target.value); setSelected(null); setError('') }}>
          <option value="existing">Select by customer ID</option><option value="new">Create customer</option>
        </select></label>
        {mode === 'existing' ? <>
          <label className="field"><span>Customer ID</span><input type="number" min="1" required value={customerId} onChange={e => { setCustomerId(e.target.value); setSelected(null) }} /></label>
          <button type="button" className="button secondary" disabled={!customerId} onClick={selectCustomer}>Find customer</button>
          {selected && <p role="status">Selected: {selected.full_name} · {selected.email} · {selected.phone} (ID {selected.id})</p>}
        </> : <>
          {Object.entries({ full_name: 'Full name', email: 'Email', phone: 'Phone' }).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input required type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} maxLength={key === 'phone' ? 20 : 150} value={customer[key]} onChange={e => setCustomer({ ...customer, [key]: e.target.value })} /></label>)}
          <p className="muted">Creates a customer record without enabling password sign-in.</p>
        </>}
        <label className="field"><span>Shop bill number</span><input required maxLength={80} value={bill.bill_number} onChange={e => setBill({ ...bill, bill_number: e.target.value })} /></label>
        <label className="field"><span>Purchase date</span><input required type="date" value={bill.purchase_date} onChange={e => setBill({ ...bill, purchase_date: e.target.value })} /></label>
        <label className="field"><span>Final paid amount (₹)</span><input required type="number" min="0.01" max="99999999.99" step="0.01" value={bill.amount} onChange={e => setBill({ ...bill, amount: e.target.value })} /></label>
        <p className="muted">Bill numbers must be unique across the shop. Completed entries cannot be edited. Referral and commission rules apply automatically.</p>
        <button className="button primary" disabled={mode === 'existing' && !selected}>{busy ? 'Saving…' : 'Record completed purchase'}</button>
      </fieldset>
    </form>
    {error && <p role="alert">{error}</p>}
    {saved && <p role="status">Bill {saved.bill_number} saved for customer ID {saved.customer_id}. <Link to={`/admin/orders/${saved.id}`}>View purchase</Link></p>}
  </details>
}
