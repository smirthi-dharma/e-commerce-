import { lazy, Suspense } from 'react'

const Categories = lazy(() => import('./pages/Categories'))
const DemoBasket = lazy(() => import('./pages/DemoBasketRoute'))
const Wallet = lazy(() => import('./pages/Wallet'))
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import StoreLayout from './layouts/StoreLayout'
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
import Home from './pages/Home'
import Products from './pages/Products'
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
import Cart from './pages/Cart'
const Checkout = lazy(() => import('./pages/Checkout'))
const Orders = lazy(() => import('./pages/Orders'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
const Referral = lazy(() => import('./pages/Referral'))
const Account = lazy(() => import('./pages/Account'))
const Admin = lazy(() => import('./pages/Admin'))
const AdminOrders = lazy(() => import('./pages/AdminOrders'))
const AdminProducts = lazy(() => import('./pages/AdminProducts'))
const AdminReferrals = lazy(() => import('./pages/AdminReferrals'))
const AdminReferralNetwork = lazy(() => import('./pages/AdminReferralNetwork'))
const AdminCustomers = lazy(() => import('./pages/AdminCustomers'))
const AdminStaff = lazy(() => import('./pages/AdminStaff'))
const AccountServices = lazy(() => import('./pages/AccountServices'))
const AdminServices = lazy(() => import('./pages/AdminServices'))
const Login = lazy(() => import('./pages/AuthPages').then(module => ({ default: module.Login })))
const Register = lazy(() => import('./pages/AuthPages').then(module => ({ default: module.Register })))
import { canAccessAdminModule, hasAdminAccess } from './utils/adminAccess'

const PolicyPage = lazy(() => import('./pages/PolicyPage'))
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'))
const ShoppingLists = lazy(() => import('./pages/ShoppingLists'))

function Guard({ admin = false, adminModule, adminRoles, children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="state-card">Loading your account…</div>
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  if (admin && !hasAdminAccess(user)) return <Navigate to="/" replace />
  if (adminModule && !canAccessAdminModule(user, adminModule)) return <Navigate to="/admin" replace />
  if (adminRoles && !adminRoles.includes(user?.role)) return <Navigate to="/admin" replace />
  return children
}

export default function App() {
  return <Suspense fallback={<div className="state-card">Loading page…</div>}><Routes><Route element={<StoreLayout />}>
    <Route index element={<Home />} />
    <Route path="categories" element={<Categories />} />
    <Route path="wallet" element={<Wallet />} />
    <Route path="products" element={<Products />} />
    <Route path="products/:id" element={<ProductDetail />} />
    <Route path="cart" element={<Cart />} />
    <Route path="demo-basket" element={<DemoBasket />} />
    <Route path="delivery-info" element={<Navigate to="/delivery-policy" replace />} />
    <Route path="terms-and-conditions" element={<Suspense fallback={<div className="state-card">Loading policy…</div>}><PolicyPage policy="terms" /></Suspense>} />
    <Route path="privacy-policy" element={<Suspense fallback={<div className="state-card">Loading policy…</div>}><PolicyPage policy="privacy" /></Suspense>} />
    <Route path="delivery-policy" element={<Suspense fallback={<div className="state-card">Loading policy…</div>}><PolicyPage policy="delivery" /></Suspense>} />
    <Route path="return-refund-policy" element={<Suspense fallback={<div className="state-card">Loading policy…</div>}><PolicyPage policy="returns" /></Suspense>} />
    <Route path="ugc-policy" element={<Suspense fallback={<div className="state-card">Loading policy…</div>}><PolicyPage policy="ugc" /></Suspense>} />
    <Route path="checkout" element={<Guard><Checkout /></Guard>} />
    <Route path="login" element={<Login />} />
    <Route path="register" element={<Register />} />
    <Route path="account" element={<Account />} />
    <Route path="delete-account" element={<DeleteAccount />} />
    <Route path="account/shopping-lists" element={<Guard><ShoppingLists /></Guard>} />
    <Route path="account/:section" element={<Guard><AccountServices /></Guard>} />
    <Route path="blogs" element={<AccountServices />} />
    <Route path="blogs/:slug" element={<AccountServices />} />
    <Route path="orders" element={<Guard><Orders /></Guard>} />
    <Route path="orders/:id" element={<Guard><OrderDetail /></Guard>} />
    <Route path="referrals" element={<Referral />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>
  <Route path="admin" element={<Guard admin><AdminLayout /></Guard>}>
    <Route index element={<Admin />} />
    <Route path="orders" element={<Guard adminModule="orders"><AdminOrders /></Guard>} />
    <Route path="orders/:id" element={<Guard adminModule="orders"><OrderDetail admin /></Guard>} />
    <Route path="products" element={<Guard adminModule="products"><AdminProducts /></Guard>} />
    <Route path="categories" element={<Guard adminModule="products"><Navigate to="/admin/products" replace /></Guard>} />
    <Route path="customers" element={<Guard adminModule="customers"><AdminCustomers /></Guard>} />
    <Route path="staff" element={<Guard adminRoles={['admin', 'super_admin']}><AdminStaff /></Guard>} />
    <Route path="referrals" element={<Guard adminModule="referrals"><AdminReferrals /></Guard>} />
    <Route path="referrals/network/:customerId" element={<Guard adminModule="referrals"><AdminReferralNetwork /></Guard>} />
    <Route path="services" element={<AdminServices />} />
    <Route path="services/:module" element={<AdminServices />} />
  </Route>
  </Routes></Suspense>
}
