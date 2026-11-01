import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductPrice } from './Shared'
const render = product => renderToStaticMarkup(<ProductPrice product={product} />)
describe('minimal honest price display', () => {
 it('can show a genuine previous selling price while suppressing sample MRP', () => {
  const html=render({price:65,mrp:100,mrp_is_sample:true,regular_price:80}); expect(html).toContain('Previous price ₹80'); expect(html).toContain('19% OFF'); expect(html).not.toContain('₹100')
 })
 it('uses saved MRP and selling price for rounded percentage', () => {
  const html=render({price:65,mrp:80}); expect(html).toContain('19% OFF'); expect(html).toContain('₹65'); expect(html).toContain('<s ')
 })
 it.each([null,65,60])('does not claim savings without a higher MRP (%s)', mrp => {
  const html=render({price:65,mrp}); expect(html).not.toContain('OFF'); expect(html).not.toContain('<s '); expect(html).not.toContain('Selling price'); expect(html).not.toContain('Not provided')
 })
 it('keeps internal verification metadata out of the price display', () => {
  const html=render({price:65,mrp:80,mrp_is_sample:true}); expect(html).not.toContain('OFF'); expect(html).not.toContain('₹80'); expect(html).not.toContain('Sample MRP')
 })
})
