import { ShoppingBag } from 'lucide-react'
import { categoryImageSource } from '../utils/catalogueArtwork'

export default function CategoryVisual({ name = '', image, imageUrl }) {
  const source = image || imageUrl || categoryImageSource(name)
  return <span className={`category-visual${source ? ' category-visual-photo' : ''}`}>{source ? <img src={source} alt="" width="108" height="102" loading="lazy" decoding="async" /> : <ShoppingBag size={29} aria-hidden="true" />}</span>
}
