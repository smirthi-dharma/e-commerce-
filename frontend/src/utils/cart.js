export function normalizeCart(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || item.id == null) return []
    const price = Number(item.price)
    const quantity = Number(item.quantity)
    const stock = item.stock == null ? null : Number(item.stock)
    if (!Number.isFinite(price) || !Number.isInteger(quantity) || quantity < 1) return []
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return []
    return [{
      ...item,
      price,
      quantity: Math.min(quantity, 99),
      ...(stock === null ? {} : { stock }),
    }]
  })
}

export function readSavedCart(storageValue) {
  try {
    return normalizeCart(JSON.parse(storageValue || '[]'))
  } catch {
    return []
  }
}

export function wholesaleTier(product) {
  const price = Number(product?.price)
  const wholesale = product?.wholesale_price == null ? NaN : Number(product.wholesale_price)
  const minQuantity = Number(product?.wholesale_min_quantity)
  if (!Number.isFinite(price) || !Number.isFinite(wholesale) || !Number.isInteger(minQuantity) || minQuantity < 2 || wholesale >= price) return null
  return { price: wholesale, minQuantity, saving: price - wholesale }
}

export function unitPrice(product, quantity = product.quantity) {
  const tier = wholesaleTier(product)
  return tier && quantity >= tier.minQuantity ? tier.price : Number(product.price)
}

export const lineTotal = (item) => unitPrice(item) * item.quantity
