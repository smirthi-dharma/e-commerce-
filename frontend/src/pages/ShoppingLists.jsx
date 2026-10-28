import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import { useCart } from '../context/CartContext'
import { ErrorState } from '../components/Shared'

export default function ShoppingLists() {
  const cart = useCart()
  const [lists, setLists] = useState([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = () => api.get('/account/shopping-lists/').then(({ data }) => setLists(data.results || data))
  useEffect(() => { load().catch(exception => setError(errorMessage(exception))) }, [])
  const save = async event => {
    event.preventDefault(); setError('')
    try { await api.post('/account/shopping-lists/', { name, items: cart.items.map(item => ({ product_id: item.id, quantity: item.quantity })) }); setName(''); await load(); setMessage('Shopping list saved.') }
    catch (exception) { setError(errorMessage(exception)) }
  }
  const remove = async id => {
    try { await api.delete(`/account/shopping-lists/${id}/`); await load() } catch (exception) { setError(errorMessage(exception)) }
  }
  return <section className="wrap section"><h1>Your shopping lists</h1><p>Save your basket for your next weekly or monthly shop.</p><form className="form-stack" onSubmit={save}><label className="field"><span>List name</span><input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Weekly essentials" /></label><button className="button primary" disabled={!cart.items.length}>Save current basket</button></form>{error && <ErrorState message={error} />}{message && <p role="status">{message}</p>}<div className="service-record-list">{lists.map(list => <article className="service-record" key={list.id}><div><h2>{list.name}</h2><p>{list.items.length} saved products · {list.products.length} available now</p><p>{list.products.map(product => `${product.name} × ${product.quantity}`).join(', ')}</p></div><button className="button primary" disabled={!list.products.length} onClick={() => { list.products.forEach(product => cart.add(product, product.quantity)); setMessage('Available products added at current prices. Check your basket before ordering.') }}>Add available items</button><button className="button secondary" onClick={() => remove(list.id)}>Delete list</button></article>)}</div>{!lists.length && <p>No saved lists yet.</p>}<Link className="text-link" to="/cart">View basket</Link></section>
}
