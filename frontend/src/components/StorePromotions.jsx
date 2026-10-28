import { Link } from 'react-router-dom'

const promotions = [
  { key: 'fresh', match: /vegetable|fruit|fresh|produce/i, title: <>Fresh picks,<br />every day.</>, description: 'Fresh vegetables for your everyday cooking.', image: 'fresh-picks.webp' },
  { key: 'pantry', match: /pantry|rice|grain|grocery/i, title: <>Your pantry,<br />all sorted.</>, description: 'Rice, grains & kitchen staples, in one place.', image: 'pantry-essentials.webp' },
  { key: 'care', match: /toiletr|care|bath/i, title: <>A little care,<br />every day.</>, description: 'Make room for your everyday favourites.', image: 'everyday-care.webp' },
]

export default function StorePromotions({ categories, banners = [] }) {
  if (banners.length) return <nav className="quick-collections" aria-label="Store offers">{banners.slice(0, 3).map(banner => <Link key={banner.id} className="collection-pantry" to={/^\/(?!\/)/.test(banner.target_url || '') && !banner.target_url.includes('\\') ? banner.target_url : '/products'}>{banner.image_url && <img src={banner.image_url} alt="" loading="lazy" />}<div><h2>{banner.title}</h2><p>{banner.subtitle}</p><span className="collection-cta">Shop now</span></div></Link>)}</nav>

  return <nav className="quick-collections" aria-label="Explore store departments">{promotions.map(promotion => {
    const category = categories.find(item => promotion.match.test(item.name))
    return <Link key={promotion.key} className={`collection-${promotion.key}`} to={category ? `/products?category=${category.id}` : '/products'}>
      <img src={`/images/storefront/${promotion.image}`} alt="" width="1672" height="941" loading="lazy" decoding="async" />
      <div><h2>{promotion.title}</h2><p>{promotion.description}</p><span className="collection-cta">Shop now</span></div>
    </Link>
  })}</nav>
}
