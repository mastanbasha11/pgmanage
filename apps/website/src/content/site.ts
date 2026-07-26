// Site-wide strings and configuration. Single source for names, contact
// details, nav and the WhatsApp CTA — nothing here is hardcoded in a page.

export const site = {
  name: 'PGManage',
  domain: 'pgmanage.in',
  url: 'https://pgmanage.in',
  // One line, used as the default meta description base and OG fallback.
  tagline: 'Rent, beds and leads for a PG — on one screen.',

  contact: {
    email: 'pgmanage36@gmail.com',
    // Click-to-WhatsApp sales/demo line. Digits only, country code first,
    // for wa.me — no +, spaces or dashes.
    whatsapp: '917702294477',
    whatsappDisplay: '+91 77022 94477',
  },

  // Prefilled message for the click-to-WhatsApp CTA.
  waMessage: "Hi PGManage — I run a PG and want to see a demo.",

  origin: {
    // The property PGManage was built in. Never named. Used as evidence only.
    descriptor: 'a 121-bed co-living property in Hyderabad',
  },

  nav: [
    { href: '/product', label: 'Product' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/about', label: 'About' },
    { href: '/security', label: 'Security' },
  ],

  footerNav: [
    {
      heading: 'Product',
      links: [
        { href: '/product/rent-collection', label: 'Rent collection' },
        { href: '/product/occupancy', label: 'Beds & leads' },
        { href: '/product/money', label: 'Money & control' },
        { href: '/pricing', label: 'Pricing' },
      ],
    },
    {
      heading: 'Company',
      links: [
        { href: '/about', label: 'About' },
        { href: '/security', label: 'Security' },
        { href: '/demo', label: 'Book a demo' },
      ],
    },
    {
      heading: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacy' },
        { href: '/terms', label: 'Terms' },
      ],
    },
  ],

  seoCities: ['Hyderabad', 'Bangalore', 'Pune'],
};

/** wa.me deep link with the prefilled enquiry message. */
export function waLink(message: string = site.waMessage): string {
  return `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}

/** Indian digit grouping for rupee figures. Never bare toLocaleString(). */
export function inr(paiseOrRupees: number, opts: { fromPaise?: boolean } = {}): string {
  const rupees = opts.fromPaise ? paiseOrRupees / 100 : paiseOrRupees;
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(rupees);
}
