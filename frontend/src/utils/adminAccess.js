const ADMIN_ROLE_MODULES = {
  delivery_partner: ['delivery'],
  admin: ['*'],
  super_admin: ['*'],
  product_manager: ['products'],
  inventory_manager: ['products', 'inventory'],
  order_manager: ['orders', 'delivery'],
  customer_support: ['customers', 'support', 'returns'],
  marketing_manager: ['blogs', 'referrals', 'coupons', 'promotions'],
  finance_manager: ['payments', 'refunds', 'reports', 'reseller-finance'],
}

export function hasAdminAccess(user) {
  if (!user?.role || !Object.hasOwn(ADMIN_ROLE_MODULES, user.role)) return false
  return ['admin', 'super_admin'].includes(user.role) || (Array.isArray(user.admin_modules) && user.admin_modules.length > 0)
}

export function canAccessAdminModule(user, module) {
  if (!hasAdminAccess(user)) return false
  if (['admin', 'super_admin'].includes(user?.role)) return true
  const modules = Array.isArray(user?.admin_modules) ? user.admin_modules : []
  return Boolean(modules && (modules.includes('*') || modules.includes(module)))
}
