import { ArrowRight, ShoppingBag } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import CategoryVisual from '../components/CategoryVisual'
import { ErrorState } from '../components/Shared'

export default function Categories() {
  const { categories = [], categoryError, refreshCategories } = useOutletContext()
  return <section className="quick-directory wrap"><span className="section-kicker">FIND YOUR EVERYDAY FAVOURITES</span><h1>Aisles of good things.</h1><p>From kitchen staples to little everyday luxuries.</p>{categoryError && <><ErrorState message={categoryError} /><button className="button secondary" onClick={refreshCategories}>Try again</button></>}<nav className="directory-categories" aria-label="Shop categories"><Link to="/products"><span className="category-visual category-all"><ShoppingBag size={30} /></span><strong>All products</strong><ArrowRight size={18} /></Link>{categories.map(category => <Link key={category.id} to={`/products?category=${category.id}`}><CategoryVisual name={category.name} imageUrl={category.image_url} /><strong>{category.name}</strong><ArrowRight size={18} /></Link>)}</nav></section>
}
