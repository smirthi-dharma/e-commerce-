import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { errorMessage } from '../services/api'

export const deletionContact = { email: 'pandiyanestore@gmail.com', phone: '8610501831' }

export default function DeleteAccount() {
  const { user, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      await api.post('/auth/delete-account/', { password })
      localStorage.removeItem('sm_access')
      localStorage.removeItem('sm_refresh')
      setDone(true)
      await logout().catch(() => {})
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return <article className="wrap section policy-page">
    <span className="eyebrow">PANDIYAN STORES · YOUR ACCOUNT</span>
    <h1>Delete your account</h1>
    <div className="policy-content">
      <section className="policy-section">
        <h2>What is deleted</h2>
        <p>Your name, email address, mobile number and password are erased from your account, and you are signed out on every device. Your saved addresses, wishlist, questions, requests and support tickets are deleted. You cannot sign in to the account again; you can register a new account with the same email address later.</p>
      </section>
      <section className="policy-section">
        <h2>What is kept, and for how long</h2>
        <p>Records of orders you placed (items, amounts, the delivery name, phone number and address on the order, and the invoice) are kept for up to 8 years, as required for tax and accounting records under Indian law, and are then deleted. Wallet and referral transaction entries linked to those orders are kept for the same period. These records are no longer linked to your name, email or login.</p>
      </section>
      <section className="policy-section">
        <h2>Before you delete</h2>
        <p>If an order is still being processed or delivered, wait until it is delivered or cancelled. Any wallet balance or pending referral reward is forfeited when the account is deleted.</p>
      </section>

      {done
        ? <div className="notice" role="status">Your account has been deleted. <Link to="/">Return to the store</Link></div>
        : user
          ? <form onSubmit={submit} className="form-stack">
            <label className="field">Confirm your password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label className="delete-account-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I understand that this cannot be undone.</label>
            {error && <div className="notice error">{error}</div>}
            <button className="button primary full" disabled={busy || !confirmed}>{busy ? 'Deleting account…' : 'Delete my account'}</button>
          </form>
          : <section className="policy-section">
            <h2>How to request deletion</h2>
            <p><Link to="/login" state={{ from: '/delete-account' }}>Sign in</Link> and return to this page, or open <strong>Profile → Delete account</strong> in the Pandiyan Stores app.</p>
            <p>If you cannot sign in, email <a href={`mailto:${deletionContact.email}?subject=Account%20deletion%20request`}>{deletionContact.email}</a> or call <a href={`tel:${deletionContact.phone}`}>{deletionContact.phone}</a> from the email address or mobile number registered on your account. The store deletes the account within 30 days and confirms by email or phone.</p>
          </section>}
    </div>
  </article>
}
