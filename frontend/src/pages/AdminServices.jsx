import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { errorMessage } from '../services/api'
import { ErrorState, Loading } from '../components/Shared'
import AdminOperations from './AdminOperations'
import { SupportPhoto } from '../components/OrderSupport'
import { canAccessAdminModule } from '../utils/adminAccess'

const modules = {
  questions: { title: 'Customer questions', endpoint: '/admin/customer-questions/', editable: ['answer', 'status'], primary: 'subject', body: 'question', statuses: ['open', 'answered', 'closed'] },
  requests: { title: 'Customer requests', endpoint: '/admin/customer-requests/', editable: ['response', 'status'], primary: 'request_number', body: 'message', statuses: ['submitted', 'in_progress', 'resolved', 'closed'] },
  support: { title: 'Support tickets', endpoint: '/admin/support-tickets/', editable: ['response', 'status', 'priority', 'assigned_to', 'internal_notes'], primary: 'ticket_number', body: 'message', statuses: ['open', 'in_progress', 'resolved', 'closed'] },
  returns: { title: 'Return requests', endpoint: '/admin/returns/', editable: ['response', 'status'], primary: 'order', body: 'reason', statuses: ['submitted', 'approved', 'rejected', 'completed'] },
  resellers: { title: 'Reseller applications', endpoint: '/admin/resellers/', editable: ['status', 'admin_note'], primary: 'email', body: 'application_note', statuses: ['pending', 'approved', 'rejected'] },
  commissions: { title: 'Reseller commission ledger', endpoint: '/admin/reseller-commissions/', editable: ['status'], primary: 'order_number', body: 'amount', statuses: ['pending', 'approved', 'paid', 'reversed'] },
  payouts: { title: 'Reseller payout requests', endpoint: '/admin/reseller-payouts/', editable: ['status', 'admin_note'], primary: 'request_number', body: 'amount', statuses: ['pending', 'approved', 'paid', 'rejected'] },
}

const moduleAccess = {
  questions: 'support',
  requests: 'support',
  support: 'support',
  returns: 'returns',
  resellers: 'customers',
  commissions: 'reseller-finance',
  payouts: 'reseller-finance',
  blogs: 'blogs',
  information: 'blogs',
  'commission-rules': 'reseller-finance',
  rewards: 'referrals',
  coupons: 'coupons',
  promotions: 'promotions',
  delivery: 'delivery',
  payments: 'payments',
  refunds: 'refunds',
  inventory: 'inventory',
  settings: 'admin-only',
  reports: 'reports',
  audit: 'admin-only',
}

const serviceLinks = [
  ...Object.entries(modules).map(([key, item]) => [key, item.title]),
  ['blogs', 'Blog management'],
  ['information', 'Store information'],
  ['commission-rules', 'Commission rules'],
  ['rewards', 'Rewards overview'],
  ['coupons', 'Coupons'],
  ['promotions', 'Homepage banners'],
  ['delivery', 'Delivery'],
  ['payments', 'Payments'],
  ['refunds', 'Refunds'],
  ['inventory', 'Inventory'],
  ['settings', 'Store settings'],
  ['reports', 'Reports'],
  ['audit', 'Audit log'],
]

function AdminModule({ module }) {
  const config = modules[module]
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [supportAgents, setSupportAgents] = useState([])
  const load = () => api.get(config.endpoint).then(({ data }) => setItems(Array.isArray(data) ? data : data.results || [])).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false))
  useEffect(() => {
    load()
    if (module === 'support') api.get('/admin/support-agents/').then(({ data }) => setSupportAgents(data)).catch((e) => setError(errorMessage(e)))
  }, [config.endpoint, module])
  const update = async (item, changes) => {
    setBusyId(item.id); setError('')
    try { await api.patch(`${config.endpoint}${item.id}/`, changes); await load() } catch (e) { setError(errorMessage(e)) } finally { setBusyId(null) }
  }
  return <><h1>{config.title}</h1>{error && <ErrorState message={error} />}{loading ? <Loading /> : items.length ? <div className="service-record-list">{items.map((item) => <article className="service-record admin-service-record" key={item.id}><div className="admin-service-record-main"><h2>{config.primary === 'email' ? item.email : config.primary === 'order' ? item.order_number || item.order : item[config.primary]}</h2><p>{config.body === 'amount' ? `Amount: ₹${Number(item[config.body]).toFixed(2)}` : item[config.body]}</p>{item.has_photo && <SupportPhoto id={item.id} admin />}{item.issue_type && <p>Issue: {item.issue_type} · {JSON.stringify(item.affected_items)}</p>}{item.customer && <small>Customer ID: {item.customer}</small>}</div><div className="admin-service-controls">{config.editable.map((field) => field === 'status' ? <label className="field" key={field}><span>Status</span><select aria-label={`Status for ${config.primary === 'email' ? item.email : item[config.primary]}`} value={item.status} disabled={busyId === item.id} onChange={(e) => update(item, { status: e.target.value })}>{config.statuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label> : field === 'priority' ? <label className="field" key={field}><span>Priority</span><select value={item.priority} onChange={(e) => update(item, { priority: e.target.value })}>{['low','normal','high','urgent'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : field === 'assigned_to' ? <label className="field" key={field}><span>Assigned agent</span><select value={item.assigned_to || ''} onChange={(e) => update(item, { assigned_to: e.target.value || null })}><option value="">Unassigned</option>{supportAgents.map((agent) => <option value={agent.id} key={agent.id}>{agent.first_name} {agent.last_name} · {agent.role.replaceAll('_', ' ')}</option>)}</select></label> : <label className="field" key={field}><span>{field.replaceAll('_', ' ')}</span><textarea rows="2" defaultValue={item[field] || ''} onBlur={(e) => { if (e.target.value !== (item[field] || '')) update(item, { [field]: e.target.value }) }} /></label>)}</div></article>)}</div> : <p className="muted">No records found.</p>}</>
}

export default function AdminServices() {
  const { module } = useParams()
  const { user } = useAuth()
  const [info, setInfo] = useState(null)
  const [rule, setRule] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [rewards, setRewards] = useState(null)
  const requiredModule = module && Object.hasOwn(moduleAccess, module) ? moduleAccess[module] : null
  const moduleAllowed = !module || (requiredModule === 'admin-only'
    ? ['admin', 'super_admin'].includes(user?.role)
    : Boolean(requiredModule && canAccessAdminModule(user, requiredModule)))
  useEffect(() => {
    if (!moduleAllowed) return
    if (module === 'information') api.get('/admin/store-information/').then(({ data }) => setInfo(data)).catch((e) => setError(errorMessage(e)))
    if (module === 'commission-rules') api.get('/admin/reseller-commission-rule/').then(({ data }) => setRule(data)).catch((e) => setError(errorMessage(e)))
    if (module === 'rewards') api.get('/admin/reward-overview/').then(({ data }) => setRewards(data)).catch((e) => setError(errorMessage(e)))
  }, [module, moduleAllowed])
  const saveJson = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const form = new FormData(event.currentTarget)
      const details = JSON.parse(form.get('details'))
      const policies = JSON.parse(form.get('policies'))
      const { data } = await api.patch('/admin/store-information/', { details, policies })
      setInfo(data); setMessage('Store information saved.')
    } catch (e) { setError(e instanceof SyntaxError ? 'Enter valid JSON in both fields.' : errorMessage(e)) }
  }
  const saveRule = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    try { const form = new FormData(event.currentTarget); const payload = Object.fromEntries(['commission_percent','fixed_commission','minimum_order_amount','minimum_payout'].map((key) => [key, form.get(key)])); const { data } = await api.patch('/admin/reseller-commission-rule/', payload); setRule(data); setMessage('Commission rules saved.') } catch (e) { setError(errorMessage(e)) }
  }
  if (!moduleAllowed) return <section className="wrap section admin-page"><ErrorState message="Your staff role does not have access to this administration module." /></section>
  const visibleServiceLinks = serviceLinks.filter(([key]) => {
    const required = moduleAccess[key]
    return required === 'admin-only'
      ? ['admin', 'super_admin'].includes(user?.role)
      : canAccessAdminModule(user, required)
  })

  return <section className="wrap section admin-page"><Link to="/admin" className="text-link">← Admin dashboard</Link><span className="eyebrow">STORE OPERATIONS</span><h1>Administration workbench</h1><nav className="admin-service-nav" aria-label="Store administration">{visibleServiceLinks.map(([key, label]) => <Link key={key} to={`/admin/services/${key}`}>{label}</Link>)}</nav>
    {!module && <p>Select a module to review submissions, respond to customers, manage reseller activity, or configure published store details. Published blog content and reseller commissions are based on database records.</p>}
    {Object.hasOwn(modules, module) && <AdminModule key={module} module={module} />}
    {module === 'information' && <><h2>Configure public store details and policy text</h2><p>Policy values are plain text keyed by <code>terms</code>, <code>privacy_policy</code>, <code>return_policy</code>, and <code>ugc_policy</code>. Delivery rules are generated from store settings so they stay aligned with checkout. Saving publishes these details immediately; policy revision history is not available. Only Senior Admins and managers explicitly granted the store-information/blogs module can edit this content.</p>{info && <form className="account-service-form" onSubmit={saveJson}><label className="field"><span>Public store details (JSON object)</span><textarea name="details" rows="9" defaultValue={JSON.stringify(info.details, null, 2)} /></label><label className="field"><span>Policies (JSON object)</span><textarea name="policies" rows="12" defaultValue={JSON.stringify(info.policies, null, 2)} /></label><button className="button primary">Save information</button></form>}</>}
    {module === 'commission-rules' && <>{rule && <form className="account-service-form service-form-grid" onSubmit={saveRule}>{[['commission_percent','Commission percent'],['fixed_commission','Fixed amount per eligible order'],['minimum_order_amount','Minimum order amount'],['minimum_payout','Minimum payout threshold']].map(([name,label]) => <label className="field" key={name}><span>{label}</span><input name={name} type="number" min="0" step="0.01" defaultValue={rule[name]} /></label>)}<p>Rules apply at order delivery time. Changes do not recalculate previously issued commissions.</p><button className="button primary">Save commission rules</button></form>}</>}
    {module === 'rewards' && <>{rewards && <><h2>Referral reward records</h2><div className="service-record-list">{(rewards.referral_rewards || []).length ? rewards.referral_rewards.map((reward) => <article className="service-record" key={reward.id}><span>Customer {reward.recipient} · {reward.recipient_type} · {reward.created_at && new Date(reward.created_at).toLocaleDateString()}</span><strong>₹{Number(reward.amount).toFixed(2)}</strong></article>) : <p>No referral rewards have been issued.</p>}</div></>}</>}
    {['coupons','delivery','payments','refunds','inventory','settings','reports','promotions','audit'].includes(module) && <AdminOperations module={module} />}
    {module === 'blogs' && <BlogAdmin />}
    {error && <ErrorState message={error} />}{message && <div className="notice success" role="status">{message}</div>}
  </section>
}

function BlogAdmin() {
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const load = () => Promise.all([api.get('/admin/blogs/'), api.get('/admin/blog-categories/')]).then(([postResponse, categoryResponse]) => {
    setPosts(Array.isArray(postResponse.data) ? postResponse.data : postResponse.data.results || [])
    setCategories(Array.isArray(categoryResponse.data) ? categoryResponse.data : categoryResponse.data.results || [])
  }).catch((e) => setError(errorMessage(e)))
  useEffect(() => { load() }, [])
  const create = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const payload = Object.fromEntries(new FormData(form))
    payload.category = payload.category || null
    try {
      if (editing) {
        await api.patch(`/admin/blogs/${editing.id}/`, payload)
        setNotice('Blog post updated.')
        setEditing(null)
      } else {
        payload.is_published = false
        await api.post('/admin/blogs/', payload)
        setNotice('Draft created.')
      }
      form.reset()
      await load()
    } catch (e) { setError(errorMessage(e)) }
  }
  const publish = async (post) => { try { await api.patch(`/admin/blogs/${post.id}/`, { is_published: !post.is_published, published_at: post.is_published ? null : new Date().toISOString() }); await load() } catch (e) { setError(errorMessage(e)) } }
  const remove = async (post) => {
    if (!window.confirm(`Delete "${post.title}"?`)) return
    try { await api.delete(`/admin/blogs/${post.id}/`); setNotice('Blog post deleted.'); await load() } catch (e) { setError(errorMessage(e)) }
  }
  const saveCategory = async (event) => {
    event.preventDefault()
    const payload = Object.fromEntries(new FormData(event.currentTarget))
    try {
      if (editingCategory) await api.patch(`/admin/blog-categories/${editingCategory.id}/`, payload)
      else await api.post('/admin/blog-categories/', payload)
      setEditingCategory(null); setNotice('Blog category saved.'); await load()
    } catch (e) { setError(errorMessage(e)) }
  }
  const removeCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"? Its posts will become uncategorized.`)) return
    try { await api.delete(`/admin/blog-categories/${category.id}/`); setNotice('Category deleted.'); await load() } catch (e) { setError(errorMessage(e)) }
  }
  return <><h2>Blog management</h2><form className="account-service-form" key={editing?.id || 'new-post'} onSubmit={create}><h3>{editing ? 'Edit blog post' : 'Create draft'}</h3><label className="field"><span>Title</span><input name="title" required maxLength="180" defaultValue={editing?.title || ''} /></label><label className="field"><span>URL slug</span><input name="slug" required maxLength="200" defaultValue={editing?.slug || ''} /></label><label className="field"><span>Category</span><select name="category" defaultValue={editing?.category || ''}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="field"><span>Author</span><input name="author" maxLength="120" defaultValue={editing?.author || ''} /></label><label className="field"><span>Cover image URL (optional)</span><input name="cover_image_url" type="url" defaultValue={editing?.cover_image_url || ''} /></label><label className="field"><span>Excerpt</span><textarea name="excerpt" rows="2" maxLength="400" defaultValue={editing?.excerpt || ''} /></label><label className="field"><span>Content (plain text; HTML is not rendered)</span><textarea name="content" rows="7" required defaultValue={editing?.content || ''} /></label><div className="form-actions"><button className="button primary">{editing ? 'Save changes' : 'Create draft'}</button>{editing && <button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancel edit</button>}</div></form><h3>Blog categories</h3><form className="account-service-form service-form-grid" key={editingCategory?.id || 'new-category'} onSubmit={saveCategory}><label className="field"><span>Category name</span><input name="name" required maxLength="80" defaultValue={editingCategory?.name || ''} /></label><label className="field"><span>Category slug</span><input name="slug" required maxLength="90" defaultValue={editingCategory?.slug || ''} /></label><div className="form-actions"><button className="button primary">{editingCategory ? 'Save category' : 'Add category'}</button>{editingCategory && <button className="button secondary" type="button" onClick={() => setEditingCategory(null)}>Cancel</button>}</div></form><div className="service-record-list">{categories.map((category) => <article className="service-record" key={category.id}><span>{category.name} · {category.slug}</span><div className="service-record-actions"><button className="button secondary small" onClick={() => setEditingCategory(category)}>Edit</button><button className="button secondary small" onClick={() => removeCategory(category)}>Delete</button></div></article>)}</div>{error && <ErrorState message={error} />}{notice && <p role="status">{notice}</p>}<div className="service-record-list">{posts.map((post) => <article className="service-record" key={post.id}><div><h3>{post.title}</h3><p>{post.slug} · {post.category_name || 'Uncategorized'}</p></div><div className="service-record-actions"><button className="button secondary small" onClick={() => setEditing(post)}>Edit</button><button className="button secondary small" onClick={() => publish(post)}>{post.is_published ? 'Unpublish' : 'Publish'}</button><button className="icon-button" onClick={() => remove(post)} aria-label={`Delete ${post.title}`}><span aria-hidden="true">×</span></button></div></article>)}</div></>
}
