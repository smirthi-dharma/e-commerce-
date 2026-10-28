import { describe, expect, it } from 'vitest'
import { canAccessAdminModule, hasAdminAccess } from './adminAccess'

describe('admin access', () => {
  it('gives delivery partners navigation only to their assigned module', () => {
    const driver={role:'delivery_partner',admin_modules:['delivery']}
    expect(hasAdminAccess(driver)).toBe(true)
    expect(canAccessAdminModule(driver,'delivery')).toBe(true)
    expect(canAccessAdminModule(driver,'orders')).toBe(false)
    expect(canAccessAdminModule(driver,'payments')).toBe(false)
  })
  it('allows only recognized staff roles into the admin workspace', () => {
    expect(hasAdminAccess({ role: 'admin' })).toBe(true)
    expect(hasAdminAccess({ role: 'inventory_manager', admin_modules: ['inventory'] })).toBe(true)
    expect(hasAdminAccess({ role: 'inventory_manager', admin_modules: [] })).toBe(false)
    expect(hasAdminAccess({ role: 'customer' })).toBe(false)
    expect(hasAdminAccess({ role: 'toString' })).toBe(false)
    expect(hasAdminAccess(null)).toBe(false)
  })

  it('limits staff navigation to their assigned modules', () => {
    expect(canAccessAdminModule({ role: 'inventory_manager', admin_modules: ['inventory'] }, 'inventory')).toBe(true)
    expect(canAccessAdminModule({ role: 'inventory_manager', admin_modules: ['inventory'] }, 'orders')).toBe(false)
    expect(canAccessAdminModule({ role: 'admin' }, 'orders')).toBe(true)
  })
})
