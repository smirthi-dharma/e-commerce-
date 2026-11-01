import { useState } from 'react'
import api, { errorMessage } from '../services/api'

export default function PackingChecklist({ order, onUpdate }) {
  const [barcode, setBarcode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const update = async (item, quantity) => {
    setBusy(true); setError('')
    try { const { data } = await api.post(`/admin/orders/${order.id}/packing/`, { expected_version: order.status_version, items:[{ id:item.id, quantity }] }); onUpdate(data) }
    catch (exception) { setError(errorMessage(exception)) } finally { setBusy(false) }
  }
  const scan = event => {
    event.preventDefault()
    const item = order.items.find(item => item.sku.toLowerCase() === barcode.trim().toLowerCase() || item.barcode === barcode.trim())
    if (!item) { setError('This code does not match an item in the order.'); return }
    update(item, Math.min(item.quantity, (item.picked_quantity || 0) + 1)); setBarcode('')
  }
  return <section className="packing-list"><h2>Pick and check</h2><p>Checked {order.items.reduce((sum,item) => sum + item.picked_quantity, 0)} of {order.items.reduce((sum,item) => sum + item.quantity, 0)} units</p><form onSubmit={scan}><label className="field"><span>Scan barcode or enter SKU</span><input value={barcode} onChange={event => setBarcode(event.target.value)} /></label><button className="button secondary" disabled={busy || !barcode.trim()}>Check one unit</button></form>{order.items.map(item => <label key={item.id}><input type="checkbox" checked={item.picked_quantity === item.quantity} disabled={busy} onChange={event => update(item,event.target.checked ? item.quantity : 0)} /><span>{item.product_name} · {item.picked_quantity}/{item.quantity} · {item.sku}</span></label>)}{error && <p role="alert">{error}</p>}</section>
}
