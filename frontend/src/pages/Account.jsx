import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, UserRound, Package, WalletCards, Headset, MapPin, Heart, CircleHelp, ClipboardList, BookOpen, Store, Info, ShieldCheck, Gift, LogOut, UserX } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { hasAdminAccess } from '../utils/adminAccess'

const groups = [
  {title:'Your information', rows:[[MapPin,'Address book','/account/addresses'],[Heart,'Your wishlist','/account/wishlist'],[CircleHelp,'Your questions','/account/questions'],[ClipboardList,'Your requests','/account/requests']]},
  {title:'Rewards & payments', rows:[[WalletCards,'Your wallet','/wallet'],[Gift,'Referral rewards','/referrals']]},
  {title:'More from your store', rows:[[BookOpen,'News & stories','/blogs'],[Store,'Reseller programme','/account/reseller'],[Info,'Store information','/account/information'],[ShieldCheck,'Privacy policy','/privacy-policy'],[Headset,'Contact support','/account/support'],[UserX,'Delete account','/delete-account']]},
]

export default function Account() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return <section className="profile-page personal-page">
    <div className="simple-page-title"><Link to="/" aria-label="Back to home"><ArrowLeft size={21} /></Link><h1>Profile</h1></div>
    <div className="profile-masthead"><span className="profile-avatar"><UserRound size={35} fill="currentColor" strokeWidth={1.2} /></span><h2>{user?.first_name ? `${user.first_name}’s account` : 'Your account'}</h2>{user ? <p>{user.phone || user.email}</p> : <Link className="profile-signin" to="/login">Sign in or create an account <ChevronRight size={15} /></Link>}</div>
    <nav className="profile-quick-links" aria-label="Quick account actions">{[[Package,'Your orders','/orders'],[WalletCards,'Your wallet','/wallet'],[Headset,'Need help?','/account/support']].map(([Icon,title,to]) => <Link key={to} to={to}><Icon size={25} strokeWidth={1.4} /><span>{title}</span></Link>)}</nav>
    <Link className="profile-invite" to="/referrals"><Gift size={23} /><span><strong>Share your store</strong><small>View your referral code and rewards</small></span><ChevronRight size={18} /></Link>
    {groups.map(group => <section className="profile-group" key={group.title}><h2>{group.title}</h2>{group.rows.map(([Icon,title,to]) => <Link key={to} to={to}><Icon size={18} strokeWidth={1.6} /><span>{title}</span><ChevronRight size={15} /></Link>)}</section>)}
    {hasAdminAccess(user) && <Link className="profile-admin" to="/admin"><ShieldCheck size={18} />Admin dashboard<ChevronRight size={16} /></Link>}
    {user && <button className="profile-logout" onClick={() => logout().finally(() => navigate('/'))}><LogOut size={18} />Log out</button>}
    <p className="profile-signature">Pandiyan Stores<small>Theni, Tamil Nadu</small></p>
  </section>
}
