import CategoryStockUpdate from '../components/CategoryStockUpdate'
import DriverWorkspace from '../components/DriverWorkspace'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import { ErrorState, Loading } from '../components/Shared'

const endpoints = {
  delivery: ['/admin/delivery-assignments/', 'Delivery assignments'],
  payments: ['/admin/payments/', 'Payment records'],
  refunds: ['/admin/refunds/', 'Refund records'],
  coupons: ['/admin/coupons/', 'Coupons'],
}
const localDateTime = value => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16)
}
const rows = (data) => Array.isArray(data) ? data : data.results || []
const statuses = {
  delivery: ['assigned', 'dispatched', 'failed', 'rescheduled', 'delivered'],
  refunds: ['requested', 'approved', 'recorded', 'rejected'],
}

function AdminList({ module }) {
  const [params] = useSearchParams()
  const search = module === 'delivery' ? params.get('search') || '' : ''
  const [items, setItems] = useState([])
  const [people, setPeople] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const endpoint = endpoints[module][0]
  const load = () => api.get(endpoint, {params:{search}}).then(({ data }) => setItems(rows(data))).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false))
  useEffect(() => {
    setLoading(true)
    Promise.all([load(), ...(module === 'delivery' ? [api.get('/admin/delivery-personnel/').then(({ data }) => setPeople(rows(data)))] : [])])
      .catch((e) => setError(errorMessage(e)))
  }, [module, search])
  const update = async (item, changes) => {
    setError('')
    try { await api.patch(`${endpoint}${item.id}/`, changes); await load() } catch (e) { setError(errorMessage(e)) }
  }
  const toggleCoupon = async (item) => {
    try { await api.patch(`${endpoint}${item.id}/`, { is_active: !item.is_active }); await load() } catch (e) { setError(errorMessage(e)) }
  }
  if (loading) return <Loading />
  return <><h2>{endpoints[module][1]}</h2>{search && <p>Showing delivery for {search}. <Link className="text-link" to="/admin/services/delivery">Show all</Link></p>}{error && <ErrorState message={error} />}{items.length ? <div className="service-record-list">{items.map((item) => <article className="service-record admin-service-record" key={item.id}>
    <div className="admin-service-record-main">
      <h3>{item.order_number || item.code || `Order ${item.order}`}</h3>
      <p>{module === 'delivery' ? `${item.customer_name} · ${item.address}` : module === 'payments' ? `${item.customer_email} · ₹${Number(item.amount).toFixed(2)} · ${item.method}` : module === 'refunds' ? `${item.customer_email} · ₹${Number(item.amount).toFixed(2)} · ${item.reason}` : `${item.discount_type} · ${item.value} · minimum ₹${item.minimum_purchase}`}</p>
      <small>{item.status || (item.is_active ? 'active' : 'inactive')}</small>
    </div>
    <div className="admin-service-controls">
      {module === 'delivery' && <><label className="field"><span>Assign delivery person</span><select value={item.personnel || ''} onChange={(e) => update(item, { personnel: e.target.value || null })}><option value="">Unassigned</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.phone}</option>)}</select></label><label className="field"><span>Delivery status</span><select value={item.status} onChange={(e) => update(item, { status: e.target.value })}>{statuses.delivery.map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="field"><span>Scheduled delivery</span><input type="datetime-local" key={item.scheduled_at || 'unscheduled'} defaultValue={localDateTime(item.scheduled_at)} onBlur={event => {const value = event.target.value ? new Date(event.target.value).toISOString() : null; if (value !== item.scheduled_at) update(item, {scheduled_at:value})}} /></label><label className="field"><span>Delivery note</span><textarea rows="2" defaultValue={item.delivery_note} onBlur={(e) => e.target.value !== item.delivery_note && update(item, { delivery_note: e.target.value })} /></label></>}
      {module === 'payments' && item.method === 'cod' && <button className="button primary" disabled={item.cod_collected} onClick={() => update(item, { cod_collected: true })}>{item.cod_collected ? 'COD collected' : 'Record COD collection'}</button>}
      {module === 'payments' && item.method === 'online' && <small>Gateway integration required for online payment updates.</small>}
      {module === 'refunds' && <><p>Wallet share: ₹{Number(item.wallet_refund_amount || 0).toFixed(2)} · Manual cash refund: ₹{Number(item.cash_refund_amount ?? item.amount).toFixed(2)}. The wallet share is restored automatically when recorded; do not transfer that share as cash. Rounding is reconciled across refunds.</p><label className="field"><span>Refund status</span><select value={item.status} onChange={(e) => update(item, { status: e.target.value })}>{statuses.refunds.filter((value) => value === item.status || (item.status === 'requested' && ['approved', 'rejected'].includes(value)) || (item.status === 'approved' && ['recorded', 'rejected'].includes(value))).map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label className="field"><span>Manual transfer reference</span><input defaultValue={item.transaction_reference} onBlur={(e) => e.target.value !== item.transaction_reference && update(item, { transaction_reference: e.target.value })} /></label></>}
      {module === 'coupons' && <button className={`button ${item.is_active ? 'secondary' : 'primary'}`} onClick={() => toggleCoupon(item)}>{item.is_active ? 'Disable coupon' : 'Enable coupon'}</button>}
    </div>
  </article>)}</div> : <p className="muted">No records found.</p>}</>
}

function CouponAdmin() {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [coupons, setCoupons] = useState([])
  const load = () => api.get('/admin/coupons/').then(({ data }) => setCoupons(rows(data))).catch((e) => setError(errorMessage(e)))
  useEffect(() => { load() }, [])
  const create = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const payload = Object.fromEntries(new FormData(event.currentTarget))
    payload.code = payload.code.toUpperCase()
    payload.starts_at = new Date(payload.starts_at).toISOString()
    payload.expires_at = new Date(payload.expires_at).toISOString()
    payload.usage_limit = payload.usage_limit || null
    payload.maximum_discount = payload.maximum_discount || null
    payload.minimum_purchase = payload.minimum_purchase || '0'
    payload.per_customer_limit = payload.per_customer_limit || 1
    try { await api.post('/admin/coupons/', payload); form.reset(); setMessage('Coupon created.'); load() } catch (e) { setError(errorMessage(e)) }
  }
  return <><h2>Create a coupon</h2><p>Coupon validity, usage limits, eligible products, and discounts are checked on the server during checkout.</p><form className="account-service-form service-form-grid" onSubmit={create}>
    <label className="field"><span>Code</span><input name="code" required maxLength="40" /></label>
    <label className="field"><span>Discount type</span><select name="discount_type"><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label>
    <label className="field"><span>Discount value</span><input name="value" required type="number" min="0.01" step="0.01" /></label>
    <label className="field"><span>Minimum purchase</span><input name="minimum_purchase" type="number" min="0" step="0.01" defaultValue="0" /></label>
    <label className="field"><span>Maximum discount (optional)</span><input name="maximum_discount" type="number" min="0.01" step="0.01" /></label>
    <label className="field"><span>Usage limit (optional)</span><input name="usage_limit" type="number" min="1" /></label>
    <label className="field"><span>Per-customer limit</span><input name="per_customer_limit" type="number" min="1" defaultValue="1" /></label>
    <label className="field"><span>Starts</span><input name="starts_at" required type="datetime-local" /></label>
    <label className="field"><span>Expires</span><input name="expires_at" required type="datetime-local" /></label>
    <label className="field"><span className="inline-check"><input name="new_customer_only" type="checkbox" value="true" /> New customers only</span></label>
    <button className="button primary">Create coupon</button>
  </form>{message && <p className="notice success">{message}</p>}{error && <ErrorState message={error} />}<div className="service-record-list">{coupons.map((coupon) => <article className="service-record" key={coupon.id}><strong>{coupon.code}</strong><span>{coupon.is_active ? 'Active' : 'Inactive'} · {coupon.discount_type} {coupon.value}</span></article>)}</div></>
}

function PromotionsAdmin() {
  const [banners, setBanners] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = () => api.get('/admin/homepage-banners/').then(({ data }) => setBanners(rows(data))).catch((e) => setError(errorMessage(e)))
  useEffect(() => { load() }, [])
  const create = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const payload = Object.fromEntries(new FormData(event.currentTarget))
    payload.starts_at = new Date(payload.starts_at).toISOString()
    payload.ends_at = new Date(payload.ends_at).toISOString()
    payload.sort_order = Number(payload.sort_order || 0)
    try { await api.post('/admin/homepage-banners/', payload); form.reset(); setMessage('Scheduled banner saved.'); load() } catch (e) { setError(errorMessage(e)) }
  }
  const toggle = async (banner) => {
    try { await api.patch(`/admin/homepage-banners/${banner.id}/`, { is_active: !banner.is_active }); load() } catch (e) { setError(errorMessage(e)) }
  }
  const remove = async (banner) => {
    try { await api.delete(`/admin/homepage-banners/${banner.id}/`); load() } catch (e) { setError(errorMessage(e)) }
  }
  return <><h2>Scheduled homepage banners</h2><form className="account-service-form service-form-grid" onSubmit={create}>
    <label className="field"><span>Title</span><input name="title" maxLength="140" required /></label>
    <label className="field"><span>Subtitle</span><input name="subtitle" maxLength="300" /></label>
    <label className="field"><span>Image URL (optional)</span><input name="image_url" type="url" /></label>
    <label className="field"><span>Internal target path (optional)</span><input name="target_url" placeholder="/products" /></label>
    <label className="field"><span>Starts</span><input name="starts_at" type="datetime-local" required /></label>
    <label className="field"><span>Ends</span><input name="ends_at" type="datetime-local" required /></label>
    <label className="field"><span>Display order</span><input name="sort_order" type="number" min="0" defaultValue="0" /></label>
    <button className="button primary">Schedule banner</button>
  </form>{message && <p className="notice success">{message}</p>}{error && <ErrorState message={error} />}
    <div className="service-record-list">{banners.map((banner) => <article className="service-record" key={banner.id}><div><strong>{banner.title}</strong><p>{banner.starts_at} – {banner.ends_at}</p></div><div className="service-record-actions"><button className="button secondary small" onClick={() => toggle(banner)}>{banner.is_active ? 'Disable' : 'Enable'}</button><button className="button secondary small" onClick={() => remove(banner)}>Delete</button></div></article>)}</div>
  </>
}

function StoreSettings() {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { api.get('/admin/system-settings/').then(({ data }) => setSettings(data)).catch((e) => setError(errorMessage(e))) }, [])
  const save = async (event) => {
    event.preventDefault()
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget))
      payload.allow_returns = payload.allow_returns === 'on'
      payload.orders_paused = payload.orders_paused === 'on'
      payload.enforce_opening_hours = payload.enforce_opening_hours === 'on'
      payload.delivery_pin_codes = payload.delivery_pin_codes.split(',').map((pin) => pin.trim()).filter(Boolean)
      const { data } = await api.patch('/admin/system-settings/', payload)
      setSettings(data)
      setMessage('Store settings saved.')
    } catch (e) { setError(errorMessage(e)) }
  }
  if (!settings) return error ? <ErrorState message={error} /> : <Loading />
  return <><h2>Store and fulfilment settings</h2><form key={settings.updated_at} className="account-service-form service-form-grid" onSubmit={save}>
    {[['opens_at','Opening time','time'],['closes_at','Closing time','time'],['max_active_orders','Maximum open orders (0 = unlimited)','number'],['packing_minutes_per_order','Extra preparation minutes per open order','number'],['pause_message','Message while paused','text'],['store_name','Store name','text'],['store_location','Store location','text'],['contact_phone','Contact number','tel'],['business_hours','Business hours','text'],['delivery_timeline','Delivery timeline (for example 30 minutes)','text'],['currency','Currency code','text'],['delivery_fee','Delivery fee','number'],['free_delivery_threshold','Free-delivery threshold (free only above this amount)','number'],['minimum_order_value','Minimum merchandise subtotal','number'],['default_low_stock_threshold','Default low-stock threshold','number'],['return_window_days','Return window (days)','number']].map(([name,label,type]) => <label className="field" key={name}><span>{label}</span><input name={name} type={type} defaultValue={settings[name] ?? ''} min={type === 'number' ? '0' : undefined} step={['delivery_fee','free_delivery_threshold','minimum_order_value'].includes(name) ? '0.01' : type === 'number' ? '1' : undefined} required={!name.includes('threshold') && name !== 'pause_message'} /></label>)}
    <label className="check-field"><input name="orders_paused" type="checkbox" defaultChecked={settings.orders_paused} /> Temporarily pause new orders</label><label className="check-field"><input name="enforce_opening_hours" type="checkbox" defaultChecked={settings.enforce_opening_hours} /> Accept orders only during opening hours</label><label className="field"><span>Delivery PIN codes (comma-separated)</span><input name="delivery_pin_codes" inputMode="numeric" defaultValue={settings.delivery_pin_codes.join(', ')} /></label>
    <label className="field"><span className="inline-check"><input name="allow_returns" type="checkbox" defaultChecked={settings.allow_returns} /> Accept return requests</span></label><button className="button primary">Save settings</button>
  </form>{message && <p className="notice success">{message}</p>}{error && <ErrorState message={error} />}</>
}

function DeliveryAdmin() {
  const { user } = useAuth()
  return user?.role === 'delivery_partner' ? <DriverWorkspace /> : <DeliveryManagement />
}

function DeliveryManagement() {
  const [error, setError] = useState('')
  const [areas, setAreas] = useState([])
  const [accounts, setAccounts] = useState([])
  const [people, setPeople] = useState([])
  const load = () => Promise.all([api.get('/admin/delivery-areas/'), api.get('/admin/delivery-personnel/'), api.get('/admin/delivery-accounts/')]).then(([a, p, users]) => { setAreas(rows(a.data)); setPeople(rows(p.data)); setAccounts(users.data) }).catch((e) => setError(errorMessage(e)))
  useEffect(() => { load() }, [])
  const create = async (event, endpoint) => {
    event.preventDefault()
    const form = event.currentTarget
    try { await api.post(endpoint, Object.fromEntries([...new FormData(form)].filter(([key,value]) => key !== 'user' || value !== ''))); form.reset(); load() } catch (e) { setError(errorMessage(e)) }
  }
  return <><AdminList module="delivery" /><h2>Serviceable PIN codes</h2><form className="account-service-form service-form-grid" onSubmit={(e) => create(e, '/admin/delivery-areas/')}><label className="field"><span>Area name</span><input name="name" required /></label><label className="field"><span>PIN code</span><input name="pin_code" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength="6" /></label><label className="field"><span>Delivery fee (blank uses default)</span><input name="delivery_fee" type="number" min="0" step="0.01" /></label><button className="button primary">Add service area</button></form>
    <div className="service-record-list">{areas.map((area) => <article className="service-record" key={area.id}><span>{area.name} · {area.pin_code} · {area.is_active ? 'Active' : 'Inactive'}</span><button className="button secondary small" onClick={async () => { try { await api.patch(`/admin/delivery-areas/${area.id}/`, { is_active: !area.is_active }); load() } catch (e) { setError(errorMessage(e)) } }}>{area.is_active ? 'Disable' : 'Enable'}</button></article>)}</div>
    <h2>Delivery personnel</h2><form className="account-service-form service-form-grid" onSubmit={(e) => create(e, '/admin/delivery-personnel/')}><label className="field"><span>Name</span><input name="name" required /></label><label className="field"><span>Phone</span><input name="phone" required type="tel" /></label><label className="field"><span>Delivery partner account (optional)</span><select name="user"><option value="">No linked account</option>{accounts.filter(account => !people.some(person => person.user === account.id)).map(account => <option key={account.id} value={account.id}>{account.first_name} {account.last_name} · {account.phone}</option>)}</select></label><button className="button primary">Add delivery person</button></form>
    <div className="service-record-list">{people.map((person) => <article className="service-record" key={person.id}><span>{person.name} · {person.phone} · {person.is_active ? 'Active' : 'Inactive'}</span><label className="field"><span>Linked delivery account</span><select value={person.user || ''} onChange={async event => { try { await api.patch(`/admin/delivery-personnel/${person.id}/`, {user:event.target.value || null}); load() } catch(exception) { setError(errorMessage(exception)) } }}><option value="">No linked account</option>{accounts.filter(account => account.id === person.user || !people.some(other => other.user === account.id)).map(account => <option key={account.id} value={account.id}>{account.first_name} {account.last_name} · {account.phone}</option>)}</select></label><button className="button secondary small" onClick={async () => { try { await api.patch(`/admin/delivery-personnel/${person.id}/`, { is_active: !person.is_active }); load() } catch (e) { setError(errorMessage(e)) } }}>{person.is_active ? 'Deactivate' : 'Reactivate'}</button></article>)}</div>
    {error && <ErrorState message={error} />}
  </>
}

function InventoryAdmin() {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const importCsv = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    try { const body = new FormData(form); const { data } = await api.post('/admin/inventory/import/', body); setMessage(`${data.updated.length} rows updated, ${data.errors.length} row errors.`); form.reset() } catch (e) { setError(errorMessage(e)) }
  }
  const downloadInventory = async () => {
    try {
      const { data } = await api.get('/admin/reports/inventory/', { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'inventory.csv'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(errorMessage(e)) }
  }
  return <><CategoryStockUpdate /><h2>Import stock movements from CSV</h2><p>CSV columns: <code>sku,stock,reason</code>. The stock column is a signed quantity adjustment, not a replacement count.</p><form className="account-service-form" onSubmit={importCsv} encType="multipart/form-data"><label className="field"><span>CSV file (maximum 5 MB)</span><input name="file" type="file" accept=".csv,text/csv" required /></label><button className="button secondary">Import stock CSV</button></form><button className="button secondary" type="button" onClick={downloadInventory}>Download inventory CSV</button>{message && <p role="status">{message}</p>}{error && <ErrorState message={error} />}</>
}

function Reports() {
  const [error, setError] = useState('')
  const [dates, setDates] = useState({ start: '', end: '' })
  const reports = ['sales', 'orders', 'products', 'inventory', 'customers', 'payments', 'refunds', 'coupons', 'referrals', 'wallet', 'reseller_commissions', 'payouts', 'support']
  const download = async (report) => {
    setError('')
    try {
      const { data } = await api.get(`/admin/reports/${report}/`, { params: dates, responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${report}.csv`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(errorMessage(e)) }
  }
  return <><h2>Database-backed CSV reports</h2><div className="service-form-grid report-date-form"><label className="field"><span>From date (optional)</span><input type="date" value={dates.start} onChange={(event) => setDates({ ...dates, start: event.target.value })} /></label><label className="field"><span>Through date (optional)</span><input type="date" value={dates.end} onChange={(event) => setDates({ ...dates, end: event.target.value })} /></label><button className="button secondary" onClick={() => setDates({ start: '', end: '' })}>Clear dates</button></div><div className="admin-shortcuts">{reports.map((report) => <button className="button secondary" key={report} onClick={() => download(report)}>{report.replaceAll('_', ' ')}</button>)}</div>{error && <ErrorState message={error} />}</>
}

function AuditLog() {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { api.get('/admin/audit-log/').then(({ data }) => setEntries(rows(data))).catch((e) => setError(errorMessage(e))) }, [])
  return <><h2>Recent staff changes</h2><p>The latest 200 API-recorded administrative updates, including the actor and saved change summary.</p>{error && <ErrorState message={error} />}{entries.length ? <div className="service-record-list">{entries.map((entry) => <article className="service-record" key={entry.id}><div><strong>{entry.action} · {entry.resource} · {entry.object_id}</strong><p>{entry.actor__email} · {new Date(entry.created_at).toLocaleString()}</p><pre className="audit-changes">{JSON.stringify(entry.changes, null, 2)}</pre></div></article>)}</div> : !error && <p className="muted">No staff changes have been recorded.</p>}</>
}

export default function AdminOperations({ module }) {
  if (module === 'promotions') return <PromotionsAdmin />
  if (module === 'settings') return <StoreSettings />
  if (module === 'delivery') return <DeliveryAdmin />
  if (module === 'inventory') return <InventoryAdmin />
  if (module === 'reports') return <Reports />
  if (module === 'audit') return <AuditLog />
  if (module === 'coupons') return <CouponAdmin />
  if (['payments', 'refunds'].includes(module)) return <><AdminList module={module} />{module === 'refunds' && <RefundCreate />}</>
  return <p>Choose a supported operations section.</p>
}

function RefundCreate() {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const create = async (event) => {
    event.preventDefault()
    try { await api.post('/admin/refunds/', Object.fromEntries([...new FormData(event.currentTarget)].filter(([key,value]) => key !== 'user' || value !== ''))); event.currentTarget.reset(); setMessage('Refund review request created.') } catch (e) { setError(errorMessage(e)) }
  }
  return <><h2>Start a refund review</h2><p>Use an order UUID from the order management page. Refunds are not reported as transferred until a verified transfer is recorded.</p><form className="account-service-form service-form-grid" onSubmit={create}><label className="field"><span>Order ID</span><input name="order" required /></label><label className="field"><span>Refund amount</span><input name="amount" type="number" min="0.01" step="0.01" required /></label><label className="field"><span>Reason</span><textarea name="reason" required maxLength="2000" /></label><button className="button primary">Create refund review</button></form>{message && <p role="status">{message}</p>}{error && <ErrorState message={error} />}</>
}
