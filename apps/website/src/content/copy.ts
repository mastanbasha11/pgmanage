// Page copy. Written before layout, on purpose: real sentences of real
// lengths make the design come out uneven the way real design is uneven.
// No banned words. A specific noun — beds, rent, the fourth, your manager,
// cash-in-hand — in every headline.

export const home = {
  meta: {
    title: 'PGManage — rent, beds and leads for your PG, on one screen',
    description:
      'PGManage collects the rent on WhatsApp, keeps a name against every rupee of cash, fills empty beds and shows which rooms make money. Built in a 121-bed co-living property in Hyderabad.',
  },
  hero: {
    headline: 'Ninety-four percent of the rent, collected by the fourth.',
    sub: 'PGManage runs the rent, the beds and the leads for your PG. Reminders go out on WhatsApp, every rupee of cash has a staff name against it, and you can finally see which rooms make money and which ones just look busy.',
    proofLine:
      'Built in a 121-bed co-living property in Hyderabad — 94% collected, 4.1 days to collect, 98% of WhatsApp reminders delivered.',
  },

  problem: {
    kicker: 'The month you already know',
    heading: 'You know exactly where the month goes.',
    lead: 'None of this is a mystery. It is the same four leaks every month, and they are all the kind that a notebook and a half-trusted manager cannot plug.',
    failures: [
      {
        t: 'The rent gets chased by hand.',
        d: 'One WhatsApp at a time, from you, on the third, the fifth, the ninth — until you give up on the last four and carry them into next month.',
      },
      {
        t: 'The cash has no trail.',
        d: 'Your manager collected ₹40,000 this week. Probably. The gap between what came in and what got recorded is exactly the gap money goes missing through.',
      },
      {
        t: 'A bed sits empty.',
        d: 'Someone gave notice three weeks ago and nobody wrote it down, so the room turned over with no lead lined up and you lost a month of rent on it.',
      },
      {
        t: 'The room economics are invisible.',
        d: 'You have a hunch the three-sharing rooms carry the building. You cannot prove it, so you price the next one on the same hunch.',
      },
    ],
  },

  jobs: [
    {
      id: 'rent',
      shot: 'owner-collect-rent',
      kicker: 'Collect the rent',
      heading: 'Two taps, a name against the cash, a receipt on WhatsApp.',
      body: 'Search the resident, choose full, partial or a late fee, pick UPI, cash or bank. It records who collected it, drops a receipt into the resident’s WhatsApp, and adds the cash to that staff member’s running balance until they hand it over. The rent list sorts itself into overdue, partial, due and paid, with the outstanding split into 0–15, 16–30, 31–60 and 60-plus days — so the reminder goes to the fourteen people who need it, not the blast of a hundred.',
      points: ['Full / partial / late fee', 'UPI · cash · bank', 'Cash-in-hand per staff', 'Ageing buckets & DSO'],
      link: { href: '/product/rent-collection', label: 'How rent collection works' },
    },
    {
      id: 'beds',
      shot: 'owner-vacancies',
      kicker: 'Fill the beds',
      heading: 'The bed frees on the 12th. The lead is already matched to it.',
      body: 'Notice-to-vacate is logged the day it is given, so a bed freeing on the 12th shows up weeks early — and a two-sharing room with both beds empty reads as one whole room, not two loose beds you would rent to strangers. Waiting leads are scored against the beds about to open by room type and move-in date, so the person who wanted a two-sharing AC from the 15th is sitting there next to the bed that fits. The pipeline shows contact, visit and booking as a real funnel, so you can see which stage is actually leaking.',
      points: ['Notice tracking', 'Whole-room detection', 'Lead ↔ bed matching', 'A funnel that shows the leak'],
      link: { href: '/product/occupancy', label: 'How occupancy works' },
    },
    {
      id: 'money',
      shot: 'owner-roi-payback',
      kicker: 'Know the money',
      heading: 'Which room type pays you back, and which one you keep repricing wrong.',
      body: 'Photograph the bill, categorise it, send it through approval — so a staff expense claim has a trail instead of a WhatsApp message you half-remember. Spend sits against budget per category, operating separated from capital. Payback is tracked per room type against the recovery you expected, with a plain verdict: reprice it, or fill it first. And every action — every edited payment, every deleted resident — is in the audit log with the before and after values, and a delete you can put back.',
      points: ['Expense approvals', 'Opex vs capex', 'ROI per room type', 'Audit log, before → after'],
      link: { href: '/product/money', label: 'How the money side works' },
    },
  ],

  resident: {
    kicker: 'The resident app',
    heading: 'Every resident who can see their own rent is one who stops asking you.',
    body: 'Residents open the app from a link in their WhatsApp — nothing to download. They see what they owe, pay it by UPI, pull their own receipts, check the menu, and raise a cleaning or repair request that lands in your queue instead of your personal chat. The move-out screen states the notice terms plainly. It is a resident portal, but the point of it is your inbox: the hundred small WhatsApps a month that used to be yours to answer.',
    points: ['Rent, receipts, deposit', 'Pay by UPI', 'Requests & complaints', 'KYC, vehicle, house rules'],
  },

  origin: {
    kicker: 'Where this came from',
    // First person plural, prose, no stats tiles. The site's most human moment.
    paras: [
      'PGManage was not designed in a product meeting. It was built inside a 121-bed co-living property in Hyderabad, by the people who had to collect its rent.',
      'We tried Excel first, then a generic property tool built for landlords with a dozen flats. Neither knew what a bed was, or a sharing, or a notice period, or a staff member holding four days of cash. So every month the real work happened in WhatsApp and a notebook anyway, and the software just held a copy that was already wrong.',
      'So we wrote the thing we actually needed, and we still run the building on it every day. That is the whole pitch. Everything on this site is a feature because a real month made us need it.',
    ],
  },

  close: {
    heading: 'See it on your own numbers.',
    body: 'Send us your resident list and we will load your property, rooms and beds before the demo, so you are looking at your building, not a sample one.',
  },
};

export const product = {
  meta: {
    title: 'Product — PGManage, organised around your month',
    description:
      'The full PGManage feature set, organised by the operator’s day: collect the rent, fill the beds, know the money. Real screenshots, a full capability table, no marketing adjectives.',
  },
  hero: {
    heading: 'Organised around your month, not the software’s modules.',
    sub: 'Three things run a PG: the rent comes in, the beds stay full, and you know where the money went. Everything below is one of those three.',
  },
  subpages: {
    'rent-collection': {
      meta: {
        title: 'Rent collection for a PG — two taps, WhatsApp receipts, cash trail | PGManage',
        description:
          'Collect PG rent in two taps — full, partial or late fee, over UPI, cash or bank — with a staff name against every rupee, a WhatsApp receipt, ageing buckets and DSO. Built in a 121-bed property.',
      },
      h1: 'Rent collection that leaves a trail.',
    },
    occupancy: {
      meta: {
        title: 'PG occupancy & lead matching — fill beds before they empty | PGManage',
        description:
          'Track notice-to-vacate, spot whole empty rooms, and match waiting leads to beds about to free by room type and move-in date. A real pipeline funnel for a PG or co-living property.',
      },
      h1: 'Fill the bed before it empties.',
    },
    money: {
      meta: {
        title: 'PG expenses, ROI per room & audit log | PGManage',
        description:
          'Photograph the bill, route expenses through approval, separate opex from capex, track payback per room type, and keep an audit log with before → after values and restorable deletes.',
      },
      h1: 'Know where the money went, and which room made it.',
    },
  },
};

export const about = {
  meta: {
    title: 'About PGManage — built by someone who had to collect the rent',
    description:
      'PGManage was built inside a 121-bed co-living property in Hyderabad, after Excel and a generic landlord tool both failed. This is the story of why it exists and what broke first.',
  },
  h1: 'We built this because the rent had to get collected.',
};

export const security = {
  meta: {
    title: 'Security & your residents’ data | PGManage',
    description:
      'How PGManage handles resident KYC, ID documents and phone numbers: hosting, encryption in transit and at rest, role-based access, the audit log, backups, and data export when you leave.',
  },
  h1: 'You are storing residents’ ID. Here is how we hold it.',
  lead: 'A PG keeps Aadhaar-linked KYC, photographs of ID documents, and the phone number of everyone in the building. That is sensitive, and treating it carelessly would be the fastest way to lose your trust. This page is what we actually do — and where something is not done yet, it says so.',
};

export const demo = {
  meta: {
    title: 'Book a PGManage demo',
    description:
      'A 20-minute demo on your own property. Send your resident list first and we load your beds, rooms and residents before we start. Or message us on WhatsApp.',
  },
  h1: 'Book a demo on your building.',
  reassure: [
    'Twenty minutes, on a call or in person if you are in Hyderabad.',
    'We load your property first, so you see your beds, not a sample.',
    'No card, no commitment — the trial starts only if you ask for it.',
  ],
};
