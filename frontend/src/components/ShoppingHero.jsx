import { Link } from 'react-router-dom'

export default function ShoppingHero({ banner }) {
  const target = /^\/(?!\/)/.test(banner?.target_url || '') && !banner.target_url.includes('\\') ? banner.target_url : '/products'
  return <section className="quick-hero" aria-labelledby="quick-hero-title">
    <img className="quick-hero-image" src={banner?.image_url || '/images/storefront/grocery-hero.webp'} width="2172" height="724" alt="" fetchPriority="high" decoding="async" />
    <div className="quick-hero-copy">
      <h1 id="quick-hero-title">{banner?.title || 'Your everyday essentials, delivered'}</h1>
      <p>{banner?.subtitle || 'Fresh groceries and household favourites from your neighbourhood store.'}</p>
      <Link to={target} className="hero-button">Shop now</Link>
    </div>
  </section>
}
