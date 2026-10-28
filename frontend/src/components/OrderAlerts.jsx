import { useEffect, useRef, useState } from 'react'
import { orderLabels } from '../utils/orderTracking'

export default function OrderAlerts({ order }) {
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')
  const last = useRef(null)
  useEffect(() => {
    if (last.current?.id === order.id && last.current.status !== order.status && enabled && window.Notification?.permission === 'granted') {
      const options = { body:`${order.order_number}: ${orderLabels[order.status]}`, tag:`order-${order.id}` }
      const notify = async () => {
        try {
          const registration = await navigator.serviceWorker?.getRegistration()
          if (registration) await registration.showNotification('Pandiyan Stores order update', options)
          else new Notification('Pandiyan Stores order update', options)
        } catch { setMessage('Your order status is updated here; this device could not show an alert.') }
      }
      notify()
    }
    last.current = { id:order.id, status:order.status }
  }, [order.id, order.status, order.order_number, enabled])
  if (!('Notification' in window)) return null
  const enable = async () => {
    const permission = await Notification.requestPermission()
    setEnabled(permission === 'granted')
    setMessage(permission === 'granted' ? 'Alerts are enabled while this order page is open.' : 'Alerts were not enabled. You can still follow updates here.')
  }
  return <div><button className="button secondary small" type="button" onClick={enabled ? () => { setEnabled(false); setMessage('Order alerts switched off.') } : enable}>{enabled ? 'Turn off order alerts' : 'Enable alerts while this page is open'}</button>{message && <p role="status">{message}</p>}</div>
}
