import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import OrderSupport from '../components/OrderSupport'
import { Copy, Trash2 } from 'lucide-react'
import { EmptyState, ErrorState, Loading } from '../components/Shared'
import { useCart } from '../context/CartContext'
import PolicyLink from '../components/PolicyLink'
import api, { errorMessage } from '../services/api'

const list = (data) => Array.isArray(data) ? data : data?.results || []

function useResource(url) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = () => {
    setError('')
    setLoading(true)
    return api.get(url).then(({ data: result }) => setData(result)).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [url])
  return { data, setData, error, setError, loading, refresh }
}

function PageFrame({ title, intro, children }) {
  return <section className="wrap section account-service-page"><Link to="/account" className="text-link">← Account services</Link><span className="eyebrow">YOUR ACCOUNT</span><h1>{title}</h1><p>{intro}</p>{children}</section>
}

function AddressBook() {
  const resource = useResource('/account/addresses/')
  const blank = { recipient_name: '', mobile_number: '', address_line1: '', address_line2: '', locality: '', city: '', state: '', pin_code: '', delivery_instructions: '', is_default: false }
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      if (editing) await api.put(`/account/addresses/${editing}/`, form)
      else await api.post('/account/addresses/', form)
      setForm(blank); setEditing(null); await resource.refresh()
    } catch (e) { setMessage(errorMessage(e)) } finally { setBusy(false) }
  }
  const locate = () => {
    if (!navigator.geolocation) { setMessage('Location is unavailable on this device. Enter your address manually.'); return }
    navigator.geolocation.getCurrentPosition(position => setForm(current => ({ ...current, latitude:position.coords.latitude.toFixed(6), longitude:position.coords.longitude.toFixed(6) })), () => setMessage('Location could not be read. You can still enter your address manually.'), { timeout:10000 })
  }
  const edit = (address) => { setForm({ ...address }); setEditing(address.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const remove = async (id) => {
    try { await api.delete(`/account/addresses/${id}/`); await resource.refresh() } catch (e) { setMessage(errorMessage(e)) }
  }
  return <PageFrame title="My Addresses" intro="Save delivery details for a smoother checkout.">
    <form className="account-service-form" onSubmit={save}><h2>{editing ? 'Edit address' : 'Add an address'}</h2>
      <button type="button" className="button secondary" onClick={locate}>Use my current location</button>{form.latitude && form.longitude && <p>Location pin saved: {form.latitude}, {form.longitude}. Please also enter your street address.</p>}<div className="service-form-grid">
        {[
          ['label', 'Address label (Home, Work, Other)'], ['landmark', 'Landmark (optional)'], ['recipient_name', 'Recipient name'], ['mobile_number', 'Mobile number'], ['address_line1', 'Address line 1'],
          ['address_line2', 'Address line 2 (optional)'], ['locality', 'Locality'], ['city', 'City'],
          ['state', 'State'], ['pin_code', 'PIN code'],
        ].map(([key, label]) => <label className="field" key={key}><span>{label}</span><input required={!['address_line2', 'landmark', 'label'].includes(key)} maxLength={key === 'pin_code' ? 6 : 200} pattern={key === 'pin_code' ? '[1-9][0-9]{5}' : undefined} inputMode={key === 'pin_code' || key === 'mobile_number' ? 'tel' : undefined} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      </div>
      <label className="field"><span>Delivery instructions (optional)</span><textarea rows="2" value={form.delivery_instructions} onChange={(e) => setForm({ ...form, delivery_instructions: e.target.value })} /></label>
      <label className="check-field"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Make this my default address</label>
      {message && <ErrorState message={message} />}
      <div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add address'}</button>{editing && <button type="button" className="button secondary" onClick={() => { setEditing(null); setForm(blank) }}>Cancel</button>}</div>
    </form>
    {resource.error ? <ErrorState message={resource.error} /> : resource.loading ? <Loading /> : list(resource.data).length ? <div className="service-record-list">{list(resource.data).map((address) => <article className="service-record" key={address.id}><div><h2>{address.recipient_name} {address.is_default && <span className="status status-delivered">Default</span>}</h2><p>{address.mobile_number}<br />{address.address_line1}{address.address_line2 && `, ${address.address_line2}`}<br />{address.locality}, {address.city}, {address.state} {address.pin_code}</p>{address.delivery_instructions && <small>{address.delivery_instructions}</small>}</div><div className="service-record-actions"><button className="button secondary small" onClick={() => edit(address)}>Edit</button><button className="icon-button" aria-label={`Delete address for ${address.recipient_name}`} onClick={() => remove(address.id)}><Trash2 size={17} /></button></div></article>)}</div> : <p className="muted">No saved addresses yet.</p>}
  </PageFrame>
}

function Questions() {
  const resource = useResource('/account/questions/')
  const ordersResource = useResource('/orders/')
  const [form, setForm] = useState({ subject: '', question: '', order: '' })
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setError('')
    try { await api.post('/account/questions/', { ...form, order: form.order || null }); setForm({ subject: '', question: '', order: '' }); await resource.refresh() } catch (e) { setError(errorMessage(e)) }
  }
  return <PageFrame title="Asked Questions" intro="Ask about an order or the store and follow the answer here.">
    <form className="account-service-form" onSubmit={submit}><h2>Submit a question</h2><label className="field"><span>Subject</span><input required maxLength="160" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label><label className="field"><span>Related order (optional)</span><select value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })}><option value="">Store question</option>{list(ordersResource.data).map((order) => <option value={order.id} key={order.id}>{order.order_number}</option>)}</select></label><label className="field"><span>Your question</span><textarea required rows="4" maxLength="5000" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></label>{error && <ErrorState message={error} />}{ordersResource.error && <p className="fine-print">Orders could not be loaded; you can still submit a store question.</p>}<button className="button primary">Send question</button></form>
    <h2>My questions</h2>{resource.error ? <ErrorState message={resource.error} /> : resource.loading ? <Loading /> : list(resource.data).length ? <div className="service-record-list">{list(resource.data).map((item) => <article className="service-record" key={item.id}><div><h3>{item.subject}</h3><p>{item.question}</p>{item.answer && <div className="service-response"><strong>Store answer</strong><p>{item.answer}</p></div>}</div><span className={`status status-${item.status}`}>{item.status}</span></article>)}</div> : <p className="muted">You have not submitted any questions.</p>}
  </PageFrame>
}

function CasePage({ support = false }) { return support ? <OrderSupport /> : <RequestPage /> }

function RequestPage() {
  const support = false
  const endpoint = support ? '/account/support-tickets/' : '/account/requests/'
  const resource = useResource(endpoint)
  const [form, setForm] = useState({ subject: '', message: '', kind: 'general' })
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setError('')
    try { await api.post(endpoint, form); setForm({ subject: '', message: '', kind: 'general' }); await resource.refresh() } catch (e) { setError(errorMessage(e)) }
  }
  const records = list(resource.data)
  return <PageFrame title={support ? 'Contact Support' : 'My Requests'} intro={support ? 'Use the form to open a ticket. Support contact details appear below when configured by the store.' : 'Submit a request, complaint, feedback, or general query and track its response.'}>
    {support && <SupportDetails />}
    <form className="account-service-form" onSubmit={submit}><h2>{support ? 'Open a support ticket' : 'Submit a request'}</h2>{!support && <label className="field"><span>Type</span><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="request">Request</option><option value="complaint">Complaint</option><option value="feedback">Feedback</option><option value="general">General query</option></select></label>}<label className="field"><span>Subject</span><input required maxLength="160" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label><label className="field"><span>Message</span><textarea required rows="4" maxLength="5000" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>{error && <ErrorState message={error} />}<button className="button primary">Submit</button></form>
    <h2>{support ? 'My support tickets' : 'Request history'}</h2>{resource.error ? <ErrorState message={resource.error} /> : resource.loading ? <Loading /> : records.length ? <div className="service-record-list">{records.map((item) => <article className="service-record" key={item.id}><div><h3>{support ? item.ticket_number : item.request_number} · {item.subject}</h3><p>{new Date(item.created_at).toLocaleString()} · {item.message}</p>{item.response && <div className="service-response"><strong>Store response</strong><p>{item.response}</p></div>}</div><span className={`status status-${item.status}`}>{item.status.replace('_', ' ')}</span></article>)}</div> : <p className="muted">No {support ? 'support tickets' : 'requests'} yet.</p>}
  </PageFrame>
}

function SupportDetails() {
  const { data } = useResource('/store-information/')
  const details = data?.details || {}
  return <div className="service-record support-details"><h2>Store contact</h2>{details.email && <p>Email: <a href={`mailto:${details.email}`}>{details.email}</a></p>}{details.phone && <p>Phone: <a href={`tel:${details.phone}`}>{details.phone}</a></p>}{details.address && <p>{details.address}</p>}{!details.email && !details.phone && !details.address && <p className="muted">Contact details have not been configured by the store.</p>}</div>
}

function Blogs() {
  const { slug } = useParams()
  const [category, setCategory] = useState('')
  const [posts, setPosts] = useState([])
  const [nextPage, setNextPage] = useState(null)
  const [moreError, setMoreError] = useState('')
  const categoryResource = useResource('/blog-categories/')
  const resource = useResource(slug ? `/blogs/${slug}/` : `/blogs/${category ? `?category=${encodeURIComponent(category)}` : ''}`)
  useEffect(() => {
    if (!slug) {
      setPosts(list(resource.data))
      setNextPage(resource.data?.next || null)
    }
  }, [slug, resource.data])
  const loadMore = async () => {
    if (!nextPage) return
    setMoreError('')
    try {
      const { data } = await api.get(nextPage)
      setPosts((current) => [...current, ...list(data)])
      setNextPage(data.next || null)
    } catch (e) { setMoreError(errorMessage(e)) }
  }
  if (resource.error) return <PageFrame title="Blogs" intro="Store news and helpful articles."><ErrorState message={resource.error} /></PageFrame>
  if (resource.loading) return <PageFrame title="Blogs" intro="Store news and helpful articles."><Loading /></PageFrame>
  if (slug) return <PageFrame title={resource.data.title} intro={`${resource.data.author ? `By ${resource.data.author} · ` : ''}${resource.data.published_at ? new Date(resource.data.published_at).toLocaleDateString() : ''}`}>
    {resource.data.cover_image_url && <img className="blog-cover" src={resource.data.cover_image_url} alt="" />}
    <article className="blog-content">{resource.data.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article>
  </PageFrame>
  return <PageFrame title="Blogs" intro="Published stories, news, and helpful articles from the store.">
    {categoryResource.error && <ErrorState message={categoryResource.error} />}
    {list(categoryResource.data).length > 0 && <label className="field blog-category-filter"><span>Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{list(categoryResource.data).map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select></label>}
    {posts.length ? <><div className="blog-grid">{posts.map((post) => <article className="blog-card" key={post.id}>{post.cover_image_url && <img src={post.cover_image_url} alt="" loading="lazy" />}<div><span className="eyebrow">{post.category_name || 'STORE JOURNAL'}</span><h2><Link to={`/blogs/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p><small>{post.author}{post.published_at && ` · ${new Date(post.published_at).toLocaleDateString()}`}</small><Link className="text-link" to={`/blogs/${post.slug}`}>Read article →</Link></div></article>)}</div>{moreError && <ErrorState message={moreError} />}{nextPage && <button type="button" className="button secondary blog-load-more" onClick={loadMore}>Load more articles</button>}</> : <div className="empty-state"><h2>No articles published yet</h2><p>Check back later for store news and helpful reads.</p></div>}
  </PageFrame>
}

function Wishlist() {
  const resource = useResource('/account/wishlist/')
  const { add } = useCart()
  const [error, setError] = useState('')
  const remove = async (id) => { try { await api.delete(`/account/wishlist/${id}/`); await resource.refresh() } catch (e) { setError(errorMessage(e)) } }
  const addToCart = (product) => {
    add({ ...product, in_stock: product.in_stock, category_name: '' })
    setError(`${product.name} added to your bag.`)
  }
  const items = list(resource.data)
  return <PageFrame title="Wishlist" intro="Your saved products, connected to the live catalogue.">
    {error && <div className="notice" role="status">{error}</div>}
    {resource.error ? <ErrorState message={resource.error} /> : resource.loading ? <Loading /> : items.length ? <div className="wishlist-grid">{items.map(({ id, product }) => <article className="wishlist-card" key={id}><Link to={`/products/${product.id}`} className="wishlist-image">{product.image_url && <img src={product.image_url} alt={product.name} />}</Link><div><Link to={`/products/${product.id}`}><strong>{product.name}</strong></Link><p>{money(product.price)} {!product.mrp_is_sample && product.mrp && Number(product.mrp) > Number(product.price) && <del>{money(product.mrp)}</del>}</p><span className={product.in_stock ? 'stock-ok' : 'stock-note'}>{product.in_stock ? 'In stock' : 'Currently unavailable'}</span><div className="service-record-actions"><button className="button primary small" disabled={!product.in_stock} onClick={() => addToCart(product)}>Add to bag</button><button className="icon-button" onClick={() => remove(id)} aria-label={`Remove ${product.name} from wishlist`}><Trash2 size={17} /></button></div></div></article>)}</div> : <EmptyState title="Your wishlist is empty" body="Save products from their detail pages to find them here." />}
  </PageFrame>
}

function Reseller() {
  const resource = useResource('/account/reseller/')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const application = resource.data?.application
  const apply = async (event) => { event.preventDefault(); setError(''); try { await api.post('/account/reseller/', { application_note: note }); setMessage('Application submitted for review.'); await resource.refresh() } catch (e) { setError(errorMessage(e)) } }
  const payout = async (event) => {
    event.preventDefault()
    const amount = new FormData(event.currentTarget).get('amount')
    try { await api.post('/account/reseller/payouts/', { amount }); setMessage('Payout request submitted for administrator review.'); await resource.refresh() } catch (e) { setError(errorMessage(e)) }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${resource.data.share_url}`); setMessage('Reseller link copied.') } catch (e) { setError(errorMessage(e)) }
  }
  return <PageFrame title="Reseller Programme" intro="A separate programme from customer referrals. Commissions are calculated from eligible orders and reviewed by the store.">
    {resource.error ? <ErrorState message={resource.error} /> : resource.loading ? <Loading /> : !application ? <form className="account-service-form" onSubmit={apply}><h2>Apply to become a reseller</h2><p>Applications require store approval. No payout is automatic.</p><label className="field"><span>Tell us about your application (optional)</span><textarea rows="4" maxLength="3000" value={note} onChange={(e) => setNote(e.target.value)} /></label>{error && <ErrorState message={error} />}<button className="button primary">Submit application</button></form> : <>
      <article className="service-record"><h2>Application status: <span className={`status status-${application.status}`}>{application.status}</span></h2>{application.admin_note && <p>{application.admin_note}</p>}{application.status === 'approved' && <><p>Reseller code: <strong>{application.reseller_code}</strong></p><p className="ref-link">{window.location.origin}{resource.data.share_url}<button aria-label="Copy reseller link" onClick={copyLink}><Copy size={16} /></button></p></>}</article>
      {application.status === 'approved' && <><h2>Commission history</h2><div className="service-record-list">{list(resource.data.commissions).length ? list(resource.data.commissions).map((entry) => <article className="service-record" key={entry.id}><span>Order {entry.order_number} · {new Date(entry.created_at).toLocaleDateString()}</span><strong>{money(entry.amount)}</strong><span className={`status status-${entry.status}`}>{entry.status}</span></article>) : <p className="muted">No commissions have been earned yet.</p>}</div><form className="account-service-form payout-form" onSubmit={payout}><h2>Request a payout</h2><p>Requests are reviewed and recorded by the store. No payment transfer is automatically initiated.</p><label className="field"><span>Requested amount (₹)</span><input name="amount" type="number" min="0.01" step="0.01" required /></label>{error && <ErrorState message={error} />}<button className="button primary">Request payout</button></form><h2>Payout requests</h2>{list(resource.data.payouts).length ? list(resource.data.payouts).map((item) => <article className="service-record" key={item.id}><span>{item.request_number} · {new Date(item.created_at).toLocaleDateString()}</span><strong>{money(item.amount)}</strong><span className={`status status-${item.status}`}>{item.status}</span></article>) : <p className="muted">No payout requests yet.</p>}</>}
    </>}
    {message && <div className="notice" role="status">{message}</div>}
  </PageFrame>
}

function Information() {
  const { data, error, loading } = useResource('/store-information/')
  const details = data?.details || {}
  return <PageFrame title="Store Information" intro="Store details and links to the published policy pages.">
    {error ? <ErrorState message={error} /> : loading ? <Loading /> : <div className="information-accordion">
      <details open><summary>About the store</summary><p>{details.about || 'Store information has not been provided yet.'}</p></details>
      <details><summary>Contact details</summary>{details.email && <p>Email: <a href={`mailto:${details.email}`}>{details.email}</a></p>}{details.phone && <p>Phone: <a href={`tel:${details.phone}`}>{details.phone}</a></p>}{details.address && <p>{details.address}</p>}{details.delivery_information && <p>{details.delivery_information}</p>}{!details.email && !details.phone && !details.address && <p>Contact details have not been configured.</p>}</details>
      <details><summary>Policies</summary><nav className="policy-navigation" aria-label="Store policies"><PolicyLink policy="terms">Terms &amp; Conditions</PolicyLink><PolicyLink policy="privacy">Privacy Policy</PolicyLink><PolicyLink policy="delivery">Delivery Policy</PolicyLink><PolicyLink policy="returns">Return &amp; Refund Policy</PolicyLink><PolicyLink policy="ugc">User-Generated Content Policy</PolicyLink></nav></details>
    </div>}
  </PageFrame>
}

export default function AccountServices() {
  const { section, slug } = useParams()
  if (!section) return <Blogs />
  switch (section) {
    case 'addresses': return <AddressBook />
    case 'rewards': return <Navigate to="/referrals" replace />
    case 'questions': return <Questions />
    case 'requests': return <CasePage />
    case 'support': return <CasePage support />
    case 'wishlist': return <Wishlist />
    case 'reseller': return <Reseller />
    case 'information': return <Information />
    case 'blogs': return <Blogs slug={slug} />
    default: return <PageFrame title="Not found" intro="That account service is not available."><Link to="/account">Return to account services</Link></PageFrame>
  }
}
