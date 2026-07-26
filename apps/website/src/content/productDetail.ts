// Long-form copy for the three product sub-pages. These are the SEO surface —
// 600+ words each, specific, no marketing adjectives. Structured so the
// [page].astro template can render them without per-page markup.

export interface DetailSection {
  h: string;
  p: string[];
}
export interface Detail {
  slug: string;
  eyebrow: string;
  h1: string;
  intro: string;
  shot: string;
  shotAlt?: string;
  sections: DetailSection[];
  checklist: { title: string; items: string[] };
  next: { href: string; label: string };
}

export const details: Record<string, Detail> = {
  'rent-collection': {
    slug: 'rent-collection',
    eyebrow: 'Collect the rent',
    h1: 'Rent collection that leaves a trail.',
    intro:
      'Rent is the whole business, and for most PGs it is collected the least reliably — chased by hand over WhatsApp, taken in cash by staff, and reconciled from memory at the end of the month. PGManage turns that into a two-tap action with a name against every rupee.',
    shot: 'owner-collect-rent',
    sections: [
      {
        h: 'Two taps, and the receipt sends itself',
        p: [
          'Open a resident, and the amount due is already there. Choose full, a partial amount, or add a late fee. Pick UPI, cash or bank. Confirm. That is the collection — no separate receipt to write, no ledger line to remember, no message to compose.',
          'The moment you confirm, a receipt lands in the resident’s WhatsApp with the amount, the date and the balance that remains. The resident stops asking whether the payment “went through”, because they are holding the proof. Ninety-eight percent of those messages are delivered — the property this was built in measures it from Meta’s own delivery receipts.',
        ],
      },
      {
        h: 'Every rupee of cash has a collector’s name on it',
        p: [
          'When a staff member takes cash, it is recorded against them and added to their cash-in-hand — a running total of money they are holding but have not yet handed over. At any moment you can see who is carrying how much. When they hand it over, you clear it, and the trail shows the handover.',
          'This is the reconciliation gap closed. The difference between what was collected and what was recorded is exactly where cash quietly disappears, and a notebook cannot close it because the notebook is written by the same person holding the cash. Here the record is made at the point of collection, on the collector’s own login, and it cannot be edited away afterwards.',
        ],
      },
      {
        h: 'The overdue list sorts itself',
        p: [
          'Outstanding rent is split into ageing buckets — 0–15, 16–30, 31–60 and 60-plus days — so a bill three days late and a bill two months late are not the same colour on the same list. Filters cut the list to overdue, partial, due or paid. Days sales outstanding is tracked across the property, so “are we collecting faster or slower than last month” is a number, not a feeling.',
          'A bulk WhatsApp reminder goes to a filtered set in one action — the fourteen people who are actually overdue, not a hundred-person blast that trains everyone to ignore you. The reminder is a utility message, so inside an open reply window it costs nothing, and a resident who replies has started a free conversation.',
        ],
      },
      {
        h: 'Partial payments and late fees are first-class',
        p: [
          'A resident who pays half is a normal event in a PG, not an error to work around. A partial payment records the amount, leaves the balance outstanding in the right ageing bucket, and the next reminder reflects it. A late fee is added at the point of collection and shows on the ledger and the receipt, so there is no argument later about whether it was charged.',
          'Deposits are tracked separately — held per resident, split into refundable and non-refundable, and settled at move-out against any dues. When someone leaves, the deposit maths is already done and pointing at a record, which is what turns a move-out dispute into a two-minute conversation.',
        ],
      },
    ],
    checklist: {
      title: 'What you get',
      items: [
        'Full, partial and late-fee collection in two taps',
        'UPI, cash and bank, each recorded',
        'WhatsApp receipt on every payment',
        'Cash-in-hand per staff member',
        'Ageing buckets: 0–15 / 16–30 / 31–60 / 60+',
        'DSO across the property',
        'Bulk WhatsApp reminders on a filtered list',
        'Deposit tracking, refundable and non-refundable',
      ],
    },
    next: { href: '/product/occupancy', label: 'Next: fill the beds' },
  },

  occupancy: {
    slug: 'occupancy',
    eyebrow: 'Fill the beds',
    h1: 'Fill the bed before it empties.',
    intro:
      'An empty bed is the most expensive thing in a PG, and the emptiness usually starts weeks before anyone notices — with a notice nobody logged and a lead nobody followed up. PGManage makes the vacancy visible early and puts a matched lead next to it.',
    shot: 'owner-vacancies',
    sections: [
      {
        h: 'Notice logged the day it is given',
        p: [
          'When a resident gives notice, it is recorded with the date the bed frees. From that moment the bed shows in the vacancy view as “freeing on the 12th”, not as a surprise on the 12th. A month of rent is lost when a turnover happens with no lead lined up, and the only fix is to know about it early — which means writing it down when it is said, not when the room is already empty.',
          'The vacancy view answers the three questions that actually matter: which beds are free now, which whole rooms are free, and which beds free by date. Each is a different sales conversation, so each is its own list.',
        ],
      },
      {
        h: 'A whole empty room is one room, not two loose beds',
        p: [
          'If a two-sharing room has both beds empty, renting them to two strangers is worse business than renting the room to a pair who want to share — and much worse than a small group who want the whole room. PGManage detects when every bed in a room is free and surfaces it as a whole room, so you can hold it and sell it as one.',
          'This is the kind of judgement a spreadsheet cannot make, because a spreadsheet sees twelve empty beds, not “three of these are actually two whole rooms and one half-room.” The distinction is money: whole rooms command a different rent and attract a different, often better, resident.',
        ],
      },
      {
        h: 'The waiting lead sits next to the bed that fits',
        p: [
          'Leads do not convert because they are forgotten between the enquiry and the vacancy. PGManage scores waiting leads against the beds about to free, by room type and move-in date, so the person who wanted a two-sharing AC from the 15th is shown against the bed that opens on the 14th. You offer or assign from that screen — the match is the workflow, not a note to yourself.',
          'The pipeline itself is a real funnel: contacted, visited, booked, with the source each lead came from. When conversion drops, the funnel shows where — leads that never get a site visit, or visits that never book — so you fix the leaking stage instead of guessing that you “need more leads.”',
        ],
      },
      {
        h: 'Bookings, and the advance that arrives without a bed',
        p: [
          'Daily stays and advance bookings live alongside the residents. The failure mode with advances is an amount that arrives before a bed is assigned, and then falls through a crack — so those sit in an unassigned queue that flags them until a bed is attached. When the day comes, a booking converts to a resident in one tap, carrying its details across without re-keying.',
          'The result is that a bed’s whole life — booked, occupied, on notice, freeing, free — is one continuous record, and the gaps where rent leaks out are the gaps the software is built to close.',
        ],
      },
    ],
    checklist: {
      title: 'What you get',
      items: [
        'Beds free now, whole rooms free, beds freeing by date',
        'Notice-to-vacate logged with the free date',
        'Whole-room detection',
        'Lead-to-bed matching by room type and date',
        'A pipeline funnel with source attribution',
        'Daily and advance bookings',
        'An unassigned queue for advances without a bed',
        'One-tap booking-to-resident conversion',
      ],
    },
    next: { href: '/product/money', label: 'Next: know the money' },
  },

  money: {
    slug: 'money',
    eyebrow: 'Know the money',
    h1: 'Know where the money went, and which room made it.',
    intro:
      'Most PG owners can tell you their revenue and almost nothing else — not which room type carries the building, not where the expense money goes, not whether a staff claim is real. PGManage puts the spending under approval and the returns under a microscope.',
    shot: 'owner-roi-payback',
    sections: [
      {
        h: 'Photograph the bill, route it through approval',
        p: [
          'An expense starts as a photo of the bill, categorised on the spot. From there it routes through approval, so a staff member’s claim has a trail — a bill, a category, an approver — instead of a WhatsApp message you half-remember agreeing to. Spend sits against a budget per category, and operating spend is separated from capital spend, so “we are over on groceries” and “we bought three new beds” are not the same line.',
          'This matters most with the people you half-trust. An approval step is not about suspicion; it is about making the honest case easy to prove and the dishonest one hard to hide.',
        ],
      },
      {
        h: 'Payback per room type, against what you expected',
        p: [
          'Every room type has a cost to fit out and a rent it earns, and the only question that matters is whether the second is paying back the first on schedule. PGManage tracks the recovery curve per room type — actual against expected — and shows the catch-up pace when it falls behind. The verdict is plain: reprice this type, or fill it first.',
          'This is the number that ends the pricing-by-hunch cycle. When you can see that the three-sharing rooms pay back in eleven months and the premium singles in twenty-six, the next room you fit out is priced on evidence, and the next one you build is a type you already know earns.',
        ],
      },
      {
        h: 'Every action is in the audit log, before and after',
        p: [
          'Payments, residents, expenses — every change is written to the audit log with the value before and the value after, and sensitive actions are flagged. If a payment was edited, you can see what it was, what it became, and who did it. A deleted record is not gone; it can be restored from the log.',
          'For a business run partly by staff, this is the safety floor. It means a mistake is recoverable and a manipulation is visible, and both are true without anyone having to police the system by hand.',
        ],
      },
      {
        h: 'The resident app quietly takes work off you',
        p: [
          'The money side is lighter when residents self-serve, so the resident app is part of the control story, not a separate product. Residents see their own rent and receipts, pay by UPI, and raise requests that land in a queue instead of your personal chat. Fewer inbound messages means fewer things collected, promised or logged in a WhatsApp thread that no ledger ever sees.',
          'Put together, the money side answers the questions a PG owner cannot usually answer: where did it go, who approved it, which room made it, and can I prove any of it. The answer, in each case, is a record.',
        ],
      },
    ],
    checklist: {
      title: 'What you get',
      items: [
        'Expense capture by photo, with categories',
        'Approval routing for staff claims',
        'Opex vs capex, budget per category',
        'ROI and payback per room type',
        'Reprice / fill-first verdicts',
        'Audit log with before → after values',
        'Sensitive-action flags and restorable deletes',
        'A resident app that cuts inbound WhatsApp',
      ],
    },
    next: { href: '/product/rent-collection', label: 'Back to: collect the rent' },
  },
};

export const detailOrder = ['rent-collection', 'occupancy', 'money'];
