import { useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../services/api'

export default function DriverWorkspace() {
  const [deliveries, setDeliveries] = useState([])
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(null)
  const [busy, setBusy] = useState(false)
  const watch = useRef(null)
  const sentAt = useRef(0)
  const load = () => api.get('/admin/delivery-assignments/').then(({ data }) => setDeliveries(data.results || data))
  useEffect(() => {
    load().catch(exception => setError(errorMessage(exception)))
    const timer = setInterval(() => load().catch(() => {}), 15000)
    return () => { clearInterval(timer); if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current) }
  }, [])
  useEffect(() => {
    if (sharing && !deliveries.some(delivery => delivery.id === sharing && delivery.status === 'dispatched')) {
      if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current)
      watch.current = null; setSharing(null)
    }
  }, [deliveries, sharing])
  const update = async (id, values) => {
    setBusy(true); setError('')
    try { await api.patch(`/admin/delivery-assignments/${id}/`, values); await load() }
    catch (exception) { setError(errorMessage(exception)) } finally { setBusy(false) }
  }
  const share = async delivery => {
    if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null }
    if (sharing) await update(sharing, { latitude:null, longitude:null })
    if (sharing === delivery.id) { setSharing(null); return }
    if (!navigator.geolocation) { setError('Location sharing is unavailable on this device.'); return }
    sentAt.current = 0
    setSharing(delivery.id)
    watch.current = navigator.geolocation.watchPosition(position => {
      if (Date.now() - sentAt.current < 30000) return
      sentAt.current = Date.now()
      update(delivery.id, { latitude:position.coords.latitude.toFixed(6), longitude:position.coords.longitude.toFixed(6) })
    }, () => { setError('Location could not be shared. Delivery status controls still work.'); setSharing(null); if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null }, { enableHighAccuracy:true, maximumAge:15000, timeout:15000 })
  }
  return <section className="wrap section"><h1>Your deliveries</h1><p>Update your assigned deliveries here. Location sharing runs only while this page is open and you enable it.</p>{error && <p className="notice error" role="alert">{error}</p>}<button className="button secondary" onClick={() => load().catch(exception => setError(errorMessage(exception)))}>Refresh deliveries</button>{deliveries.map(delivery => <article className="service-record" key={delivery.id}><div><h2>{delivery.order_number}</h2><p>{delivery.customer_name} · {delivery.address}</p><strong>{delivery.status.replaceAll('_',' ')}</strong><p>{delivery.delivery_note}</p><div className="order-action-row">{['assigned','rescheduled'].includes(delivery.status) && ['picked_up','out_for_delivery'].includes(delivery.order_status) && <button className="button primary" disabled={busy} onClick={() => update(delivery.id,{status:'dispatched'})}>Start delivery</button>}{delivery.status === 'dispatched' && <><button className="button primary" disabled={busy} onClick={async () => { if (sharing === delivery.id) await share(delivery); await update(delivery.id,{status:'delivered'}) }}>Mark delivered</button><button className="button secondary" disabled={busy} onClick={() => update(delivery.id,{status:'failed'})}>Mark delivery failed</button><button className="button secondary" disabled={busy} onClick={() => share(delivery)}>{sharing === delivery.id ? 'Stop sharing location' : 'Share this device’s location'}</button></>}<label className="field"><span>Delivery note / failure reason</span><textarea defaultValue={delivery.delivery_note} onBlur={event => { if (event.target.value !== delivery.delivery_note) update(delivery.id,{delivery_note:event.target.value}) }} /></label><label className="field"><span>Delivery confirmation reference (optional)</span><input defaultValue={delivery.proof_reference} onBlur={event => { if (event.target.value !== delivery.proof_reference) update(delivery.id,{proof_reference:event.target.value}) }} /></label></div></div></article>)}{!deliveries.length && <p>No deliveries are assigned to this account.</p>}</section>
}
