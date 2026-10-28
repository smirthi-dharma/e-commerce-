import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ErrorState } from '../components/Shared'
import PolicyLink from '../components/PolicyLink'
import api, { errorMessage } from '../services/api'

const contact = {
  email: 'pandiyanestore@gmail.com',
  phone: '8610501831',
  address: 'PANDIYAN STORES, M9, MULLAI NAGAR, THENI 625531, THENI, India',
}

const policyPages = {
  terms: {
    title: 'Terms & Conditions',
    key: 'terms',
    sections: [
      ['1. Acceptance of Terms', "By accessing and using PANDIYAN STORES's website and services, you agree to be bound by these Terms & Conditions. If you do not agree to these terms, please do not use our services."],
      ['2. Use of Website', 'You agree to use our website for lawful purposes only and in a way that does not infringe upon or restrict others’ use and enjoyment. You are prohibited from: using the website for any unlawful purpose; attempting to gain unauthorized access to our systems; transmitting harmful code or malware; collecting user information without consent.'],
      ['3. Product Information', 'We strive to provide accurate product descriptions and pricing. However, we do not warrant that product descriptions or prices are accurate, complete, or current. We reserve the right to modify product specifications without notice, discontinue products at any time, correct pricing errors, and reject orders in cases of pricing errors. Product prices, availability and order totals are verified by the store at checkout.'],
      ['4. Pricing and Payment', 'All prices are in Indian rupees and subject to change without notice. The website currently offers Cash on Delivery (COD); no card or online payment details are collected through checkout. We reserve the right to refuse or cancel orders for any reason, subject to applicable law.'],
      ['5. Delivery and Returns', 'Delivery times are estimates only. Risk of loss and title for items purchased pass to you upon delivery, subject to applicable law. The supplied terms propose returns within 14 days of receipt, subject to items being in original condition, proof of purchase, and proper packaging for return shipping. The separately supplied Return & Refund Policy proposes 30 days for most items; these time periods conflict and require owner/legal approval. Delivery conditions are described in the Delivery Policy.'],
      ['6. Intellectual Property', 'All content on this website, including text, graphics, logos, and images, is our property and protected by copyright laws. You may not use, reproduce, or distribute our content without permission. This wording and its application to third-party materials require legal review.'],
      ['7. Limitation of Liability', 'Owner-supplied draft: “We shall not be liable for any indirect, incidental, special, or consequential damages resulting from the use or inability to use our services. Our liability is limited to the amount paid for the products.” This clause is reproduced for review only and is not represented as enforceable or as limiting statutory consumer rights. Obtain legal review before use.'],
      ['8. Account Responsibilities', 'If you create an account, you are responsible for maintaining account security, providing accurate information, updating account information as needed, and all activities under your account.'],
      ['9. Dispute Resolution', 'Owner-supplied draft: disputes shall be resolved through negotiation or mediation before pursuing legal action; the terms are governed by local laws and legal proceedings shall be held in “our jurisdiction.” The governing law and jurisdiction are unspecified and must be completed and reviewed by the owner and legal counsel.'],
      ['10. Modifications to Terms', 'We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Continued use of our services constitutes acceptance of modified terms. The existing admin store-information tool publishes policy text immediately and does not keep policy-specific revision history.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    key: 'privacy_policy',
    sections: [
      ['Introduction', 'PANDIYAN STORES (“we,” “our,” or “us”) is committed to protecting your privacy. This draft explains how information is handled when you visit the website or place an order. It must be checked against the store’s actual hosting, operational practices and applicable law before being treated as final.'],
      ['Information We Collect', 'The website handles information supplied for accounts and orders, including name, email/contact details, phone number, saved or checkout delivery addresses, delivery instructions, order items and order history. Authentication access and refresh tokens and the shopping cart are stored in browser local storage. Signed-in baskets and named shopping lists are also saved to the customer account. Recently viewed product identifiers and recent searches are stored on this device. Checkout supports Cash on Delivery with optional referral wallet spending when enabled by the store. Support requests may include an optional photo and affected order items. Saved addresses can include optional device coordinates. A delivery partner may explicitly share a device location for the active delivery; the last coordinate is stored on the assignment and customer visibility expires after five minutes. The website does not collect card numbers or online payment credentials through checkout. No separate billing-address field or payment-information collection is identified in the current checkout.'],
      ['How We Use Your Information', 'Information is used to manage accounts, process and fulfil orders, arrange delivery, communicate about orders and support requests, and maintain order history. The supplied draft also mentions marketing communications with consent, improving services, fraud prevention and unauthorized transactions; no marketing-consent control or marketing communication feature was identified in the website, so those uses must not be treated as active without verification and implementation.'],
      ['Information Sharing', 'Information needed for order fulfilment and support is available to authorized store staff through the website. The supplied draft says information may be shared with operational service providers, payment processors and law enforcement when required by law. No online payment processor integration was identified; the owner must confirm actual service providers, hosting disclosures and any legally required disclosure practices before publishing those statements as fact. The store does not make private account, delivery-address, phone or order information public.'],
      ['Data Security', 'The application uses authenticated API access and role-based controls for customer and administrative features. Authentication tokens are stored in browser local storage. These technical measures are not a guarantee of security or an independent security certification.'],
      ['Your Rights', 'The supplied draft lists rights to access, correct and request deletion of information, opt out of marketing communications, and lodge complaints with supervisory authorities. There is no self-service account-deletion feature or marketing preference control identified in the website. Contact the store to make a request; the store must confirm its process, applicable authority and any retention requirements before these statements are treated as an approved rights procedure.'],
      ['Cookies and Tracking', 'The application uses browser local storage for authentication tokens, the shopping cart, recent searches, and recently viewed product identifiers. The store records first-party aggregate product-view, add-to-cart, search, empty-search and checkout action counts. These event records contain an event type, optional product identifier and timestamp; they do not contain search phrases, customer identifiers, session identifiers, addresses or payment data. No advertising tracker is included. Local storage is not described here as a cookie. Hosting or infrastructure may have separate technical logging; the owner must verify those settings and implement any cookie controls required for actual tracking before making further claims.'],
      ['Changes to This Policy', 'Policy text is currently managed through the admin store-information tool and changes are published immediately. The tool does not maintain policy-specific version history or an approval workflow.'],
      ['Contact Us', `${contact.address}. Email: ${contact.email}. Phone: ${contact.phone}.`],
      ['User-Generated Content Privacy', 'The supplied draft says posts and comments are visible across the website to other users and refers to consent to display information. The current product pages do not provide a public review or comment submission form. If a public content feature is enabled, only the submitted content and the information the user intentionally includes should be displayed; private account details, delivery addresses, phone numbers and order information must not be exposed. See the User-Generated Content Policy.'],
    ],
  },
  delivery: {
    title: 'Delivery Policy',
    key: null,
    sections: [],
  },
  returns: {
    title: 'Return & Refund Policy',
    key: 'return_policy',
    sections: [
      ['Return Eligibility', 'The supplied Return & Refund Policy says most items may be returned within 30 days of delivery for a full refund, subject to items being unused and in original packaging, tags and labels being attached, and proof of purchase being provided. Perishable items are stated to need return within 24 hours of purchase. These are owner-supplied proposed conditions, not a legal determination. The separate Terms & Conditions state 14 days from receipt for general returns; the owner must approve one consistent general return period. Confirm whether the 24-hour period starts at purchase or delivery.'],
      ['Non-Returnable Items', 'The supplied draft excludes opened food and beverages, opened or used personal-care products, items marked Final Sale or Clearance, and gift cards and prepaid cards. These exclusions require legal and operational review, especially for damaged, defective, unsafe or incorrectly supplied goods. They must not be used to remove statutory consumer rights.'],
      ['Return Process', 'The supplied process asks customers to visit the store with the item and proof of purchase; staff inspect the item for eligibility and, if approved, process the refund. The store should confirm the support channel and operational process before treating this as final.'],
      ['Refund Timeline and Cash on Delivery', 'The supplied draft proposes immediate store credit, 3–5 business days for refunds to the original payment method, and 5–7 business days for bank transfers. Website checkout currently supports Cash on Delivery only and has no online payment refund integration. The owner must define and approve the COD refund method and timeline; no bank-transfer process or automated reversal is claimed as implemented.'],
      ['Damaged or Defective Items', 'The supplied draft asks customers to report an issue within 48 hours of purchase, provide photos where possible, and says the store will replace the item or provide a full refund and cover return shipping for damaged items. The owner must confirm whether the 48 hours begin at purchase or delivery. Statutory consumer rights are not waived by this draft.'],
      ['Exchange Policy', 'The supplied draft proposes direct exchanges for different sizes or colours of the same item and for defective products with the same item. Availability and process require store confirmation.'],
    ],
  },
  ugc: {
    title: 'User-Generated Content Policy',
    key: 'ugc_policy',
    sections: [
      ['What customers may submit', 'The supplied draft covers reviews, photographs, videos, comments and other material created by the user (“User Generated Content” or “UGC”). The current product pages do not provide a review or comment submission form.'],
      ['Public visibility and privacy', 'Content submitted to a public review or comment feature may be visible to other website users. Do not include account credentials, phone numbers, delivery addresses, order details or other private information. The store must not publish private account or order data in public reviews.'],
      ['Owner-supplied proposed UGC licence — not active pending approval', '“Thank you for considering our request to use your post and your picture. By making available any of the contents such as reviews, photographs, videos, or other materials created by you (‘User Generated Content’), you hereby grant to PANDIYAN ENTERPRISES a worldwide, irrevocable, perpetual, non-exclusive, fully-transferable, royalty-free license, with the right to sublicense, to use, copy, adapt, modify, distribute, license, sell, transfer, publicly display, publicly perform, transmit, stream, broadcast, access, view, and otherwise exploit such User Generated Content for purposes related to advertising, promotions, and any other business interests as PANDIYAN ENTERPRISES may determine. PANDIYAN ENTERPRISES does not claim any ownership rights in any User Generated Content and nothing in this Agreement will be deemed to restrict any rights that you may have to use and exploit any such User Generated Content. Notwithstanding the foregoing, PANDIYAN ENTERPRISES has the right, but not the obligation, to remove any material, including User Generated Content, whether or not such material has been modified by you, solely at its own discretion. You understand and agree that PANDIYAN ENTERPRISES is the sole owner of all rights in and to any work created by or for PANDIYAN ENTERPRISES that uses User Generated Content, in whole or in part, and you shall have no claim of any kind or nature whatsoever against PANDIYAN ENTERPRISES based on the use of any User Generated Content. You acknowledge and agree that you are solely responsible for all User Generated Content that you make available to PANDIYAN ENTERPRISES. Accordingly, you represent and warrant that: (i) you either are the sole and exclusive owner of all User Generated Content that you make available, or you have all rights, licenses, consents and releases that are necessary to grant to PANDIYAN ENTERPRISES the rights in such User Generated Content, as contemplated under this Agreement; and (ii) neither the User Generated Content nor your posting, uploading, publication, submission or transmittal of the User Generated Content or PANDIYAN ENTERPRISES’s use of the User Generated Content (or any portion thereof), will infringe, misappropriate or violate a third party’s patent, copyright, trademark, trade secret, moral rights or other proprietary or intellectual property rights, or rights of publicity or privacy, or result in the violation of any applicable law or regulation. You represent and warrant that you are at least 13 years old. PANDIYAN ENTERPRISES retains ownership of all intellectual property on the Website other than User Generated Content, including, but not limited to, visual interfaces, graphics, design, compilation, computer code, software, and aggregate user review ratings and any work created by or for PANDIYAN ENTERPRISES that uses User Generated Content, in whole or in part.” This entire broad licence and associated rights are reproduced as a proposal only. They are not presented as an active agreement or legally validated; owner and legal approval is required before any such licence is used. No UGC submission feature is currently identified on product pages.'],
      ['Reporting and moderation', 'Report content that may be unlawful, abusive or infringing by contacting the store at the email or phone below. The store may review reports and moderate or remove content under a process to be confirmed by the owner. No automated moderation workflow is claimed.'],
      ['Privacy or removal requests', `For questions about content privacy or a removal request, contact ${contact.email} or ${contact.phone}. Requests will be reviewed by the store; no self-service content-removal workflow is currently identified.`],
    ],
  },
}

const defaults = {
  store_name: 'Pandiyan Stores',
  store_location: 'Theni, Tamil Nadu, India',
  contact_phone: '8072661435',
  business_hours: 'Every day, 9:00 AM to 9:00 PM',
  delivery_timeline: '30 minutes',
  delivery_pin_codes: ['625531', '625534'],
  minimum_order_value: 300,
  delivery_fee: 30,
  free_delivery_threshold: 1000,
}

function DeliverySections({ store }) {
  const pins = (store.delivery_pin_codes || defaults.delivery_pin_codes).join(' and ')
  const min = Number(store.minimum_order_value ?? defaults.minimum_order_value)
  const fee = Number(store.delivery_fee ?? defaults.delivery_fee)
  const freeAbove = Number(store.free_delivery_threshold ?? defaults.free_delivery_threshold)
  const timeline = store.delivery_timeline || defaults.delivery_timeline
  return <>
    <p>{store.store_location || defaults.store_location}. Store operating hours: {store.business_hours || defaults.business_hours}.</p>
    <ul>
      <li>Service is limited to PIN codes {pins}; checkout rejects unsupported PIN codes.</li>
      <li>The minimum eligible merchandise subtotal, before delivery charges, is ₹{min.toFixed(2)}.</li>
      <li>Delivery costs ₹{fee.toFixed(2)} on eligible merchandise subtotals from ₹{min.toFixed(2)} through ₹{freeAbove.toFixed(2)}, inclusive.</li>
      <li>Delivery is free only when the eligible merchandise subtotal is greater than ₹{freeAbove.toFixed(2)}.</li>
      <li>The estimated delivery window is {timeline}, subject to the store's actual delivery operations.</li>
    </ul>
    <p>The delivery charge is calculated from the merchandise subtotal before the final payable total is displayed. The delivery fee and estimated window are shown before order confirmation. Unsupported PIN codes cannot be checked out.</p>
    <p>Contact {store.store_name || defaults.store_name} at <a href={`tel:${store.contact_phone || defaults.contact_phone}`}>{store.contact_phone || defaults.contact_phone}</a> during {store.business_hours || defaults.business_hours}.</p>
  </>
}

function PolicyBody({ text, sections }) {
  if (typeof text === 'string' && text.trim()) {
    return <div className="policy-admin-text">{text}</div>
  }
  return sections.map(([heading, body]) => <section className="policy-section" key={heading}>
    <h2>{heading}</h2>
    <p>{body}</p>
  </section>)
}

export default function PolicyPage({ policy, modal = false, onClose }) {
  const page = policyPages[policy]
  const [store, setStore] = useState(defaults)
  const [policies, setPolicies] = useState({})
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    api.get('/store-information/').then(({ data }) => setPolicies(data.policies || {}))
      .catch((reason) => setError(errorMessage(reason)))
    if (policy === 'delivery') {
      api.get('/system-settings/public/').then(({ data }) => setStore((current) => ({ ...current, ...data })))
        .catch((reason) => setError(errorMessage(reason)))
    }
  }, [policy])
  useEffect(() => {
    if (!modal) return undefined
    closeButtonRef.current?.focus()
    const handleDialogKeys = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleDialogKeys)
    return () => window.removeEventListener('keydown', handleDialogKeys)
  }, [modal, onClose])

  const managedText = page.key ? policies[page.key] : null

  const content = <>
    {!modal && <span className="eyebrow">PANDIYAN STORES · STORE INFORMATION</span>}
    <h1 id={modal ? 'policy-dialog-title' : undefined}>{page.title}</h1>
    {error && <ErrorState message={`Some live store information could not be loaded. ${error}`} />}
    {policy !== 'delivery' && <div className="policy-review-notice" role="note">
      <strong>Draft — owner and legal review required.</strong>
      <span>{managedText ? 'Store-managed policy text is shown below; the site does not record whether it has received legal approval.' : 'This page includes the owner-supplied draft content. Implementation-dependent statements and unresolved terms are flagged in the relevant sections; review the complete text before treating it as final.'}</span>
    </div>}
    <div className="policy-content">
      {policy === 'delivery'
        ? <DeliverySections store={store} />
        : <PolicyBody text={managedText} sections={page.sections} />}
    </div>
    {policy === 'delivery' && <p className="policy-review-notice">Operational delivery details are displayed from the current checkout settings. The {store.delivery_timeline || defaults.delivery_timeline} window is subject to operational capacity.</p>}
    {policy !== 'delivery' && <section className="policy-section policy-contact"><h2>{policy === 'privacy' ? 'Contact Us' : 'Contact'}</h2><p>{contact.address}<br />Email: <a href={`mailto:${contact.email}`}>{contact.email}</a><br />Phone: <a href={`tel:${contact.phone}`}>{contact.phone}</a></p>{policy === 'terms' && <p>See the <PolicyLink policy="ugc">User-Generated Content Policy</PolicyLink> for the current draft on submitted content and the licence wording awaiting approval.</p>}</section>}
    <nav className="policy-navigation" aria-label="Store policies">
      <PolicyLink policy="terms">Terms &amp; Conditions</PolicyLink>
      <PolicyLink policy="privacy">Privacy Policy</PolicyLink>
      <PolicyLink policy="delivery">Delivery Policy</PolicyLink>
      <PolicyLink policy="returns">Return &amp; Refund Policy</PolicyLink>
      <PolicyLink policy="ugc">User-Generated Content Policy</PolicyLink>
    </nav>
  </>

  if (modal) return <div className="policy-modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose?.()
  }}>
    <section ref={dialogRef} className="policy-modal" role="dialog" aria-modal="true" aria-labelledby="policy-dialog-title">
      <button ref={closeButtonRef} className="policy-modal-close" type="button" onClick={onClose} aria-label="Close policy"><X size={19} /><span>Close</span></button>
      <article className="policy-modal-content">{content}</article>
    </section>
  </div>

  return <article className="wrap section policy-page">{content}</article>
}
