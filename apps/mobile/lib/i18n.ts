/**
 * i18n + Simple Mode.
 *
 * Languages: en (default), hi (Hindi), te (Telugu).
 * Simple Mode replaces dense labels ("Record Payment") with friendly,
 * emoji-prefixed labels ("💰 Take Payment") that semi-literate operators
 * can recognise. The locale dictionary holds both keys so flipping Simple
 * Mode swaps wording without re-rendering screens differently.
 *
 * Voice guidance (lib/voice.ts) reads the same dictionary, so adding a new
 * label automatically gets translated + spoken.
 */
import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

const en = {
  // tabs
  'tab.dashboard': 'Home',
  'tab.residents': 'Residents',
  'tab.rent': 'Rent',
  'tab.rooms': 'Rooms',
  'tab.more': 'More',

  // common
  'common.search': 'Search',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.loading': 'Loading…',
  'common.empty': 'Nothing here yet.',
  'common.signin': 'Sign In',
  'common.signout': 'Sign Out',
  'common.email': 'Email',
  'common.password': 'Password',
  'common.phone': 'Phone',
  'common.error': 'Something went wrong.',
  'common.retry': 'Try again',
  'common.share_whatsapp': 'Share on WhatsApp',

  // dashboard
  'dash.welcome': 'Welcome',
  'dash.occupancy': 'Occupancy',
  'dash.vacant_beds': 'Vacant beds',
  'dash.collections_today': "Today's collections",
  'dash.pending_rent': 'Pending rent',
  'dash.checkins_today': 'Check-ins today',
  'dash.checkouts_today': 'Check-outs today',
  'dash.outstanding': 'Outstanding dues',

  // residents
  'res.title': 'Residents',
  'res.add': 'New Resident',
  'res.filter.active': 'Active',
  'res.filter.notice': 'Notice given',
  'res.filter.checked_out': 'Checked-out',
  'res.filter.all': 'All',
  'res.search_placeholder': 'Search by name or phone',
  'res.notice_badge': 'Notice · {{date}}',
  'res.give_notice': 'Give notice',
  'res.checkout': 'Check out',
  'res.record_payment': 'Take Payment',
  'res.profile': 'Profile',
  'res.payments': 'Payments',

  // rent
  'rent.this_month': 'This month',
  'rent.outstanding': 'Outstanding: {{amount}}',
  'rent.status.PAID': 'PAID',
  'rent.status.PARTIAL': 'PARTIAL',
  'rent.status.UNPAID': 'UNPAID',
  'rent.pay': 'Pay',
  'rent.amount_label': 'Amount (₹)',
  'rent.mode_cash': 'Cash',
  'rent.mode_upi': 'UPI',
  'rent.mode_bank': 'Bank',
  'rent.paid_to_label': 'Paid to / by',
  'rent.recorded': '₹{{amount}} recorded for {{name}}',

  // rooms
  'rooms.legend.vacant': 'Vacant',
  'rooms.legend.reserved': 'Reserved',
  'rooms.legend.occupied': 'Occupied',
  'rooms.legend.maintenance': 'Maintenance',
  'rooms.available_now': 'Available now',
  'rooms.upcoming': 'Upcoming vacancies',

  // settings
  'set.title': 'Settings',
  'set.language': 'Language',
  'set.simple_mode': 'Simple Mode',
  'set.simple_mode_desc': 'Larger icons, friendlier words.',
  'set.voice_guidance': 'Voice guidance',
  'set.voice_guidance_desc': 'Read screen titles aloud.',
  'set.property': 'Property',
  'set.about': 'About',
  'set.version': 'Version',
};

// Hindi — fallbacks to English for missing keys via i18n-js defaults.
const hi: Partial<typeof en> = {
  'tab.dashboard': 'होम',
  'tab.residents': 'किरायेदार',
  'tab.rent': 'किराया',
  'tab.rooms': 'कमरे',
  'tab.more': 'और',
  'common.search': 'खोजें',
  'common.cancel': 'रद्द करें',
  'common.save': 'सहेजें',
  'common.loading': 'लोड हो रहा है…',
  'common.signin': 'साइन इन',
  'common.signout': 'साइन आउट',
  'common.email': 'ईमेल',
  'common.password': 'पासवर्ड',
  'common.phone': 'फ़ोन',
  'common.share_whatsapp': 'व्हाट्सएप पर भेजें',
  'dash.welcome': 'स्वागत है',
  'dash.occupancy': 'अधिभोग',
  'dash.vacant_beds': 'खाली बिस्तर',
  'dash.collections_today': 'आज की वसूली',
  'dash.pending_rent': 'बाकी किराया',
  'dash.checkins_today': 'आज चेक-इन',
  'dash.checkouts_today': 'आज चेक-आउट',
  'dash.outstanding': 'बकाया राशि',
  'res.title': 'किरायेदार',
  'res.add': '➕ नया किरायेदार',
  'res.filter.active': 'सक्रिय',
  'res.filter.notice': 'नोटिस दिया',
  'res.filter.checked_out': 'जा चुके',
  'res.filter.all': 'सभी',
  'res.search_placeholder': 'नाम या फ़ोन से खोजें',
  'res.give_notice': 'नोटिस दर्ज करें',
  'res.checkout': 'चेक आउट',
  'res.record_payment': '💰 पैसा लें',
  'res.profile': 'प्रोफ़ाइल',
  'res.payments': 'भुगतान',
  'rent.this_month': 'इस महीना',
  'rent.outstanding': 'बकाया: {{amount}}',
  'rent.pay': 'भुगतान',
  'rent.mode_cash': 'नकद',
  'rent.mode_upi': 'यूपीआई',
  'rent.mode_bank': 'बैंक',
  'rooms.legend.vacant': 'खाली',
  'rooms.legend.reserved': 'आरक्षित',
  'rooms.legend.occupied': 'भरा हुआ',
  'rooms.legend.maintenance': 'मरम्मत',
  'rooms.available_now': 'अभी खाली',
  'rooms.upcoming': 'जल्द खाली होंगे',
  'set.title': 'सेटिंग्स',
  'set.language': 'भाषा',
  'set.simple_mode': 'सरल मोड',
  'set.voice_guidance': 'आवाज़ मार्गदर्शन',
  'set.property': 'संपत्ति',
};

// Telugu
const te: Partial<typeof en> = {
  'tab.dashboard': 'హోమ్',
  'tab.residents': 'నివాసులు',
  'tab.rent': 'అద్దె',
  'tab.rooms': 'గదులు',
  'tab.more': 'మరిన్ని',
  'common.search': 'వెతకండి',
  'common.cancel': 'రద్దు',
  'common.save': 'సేవ్',
  'common.loading': 'లోడ్…',
  'common.signin': 'సైన్ ఇన్',
  'common.signout': 'సైన్ అవుట్',
  'common.email': 'ఇమెయిల్',
  'common.password': 'పాస్‌వర్డ్',
  'common.phone': 'ఫోన్',
  'common.share_whatsapp': 'వాట్సాప్‌లో పంపండి',
  'dash.welcome': 'స్వాగతం',
  'dash.occupancy': 'ఆక్యుపెన్సీ',
  'dash.vacant_beds': 'ఖాళీ బెడ్‌లు',
  'dash.collections_today': 'నేటి వసూళ్లు',
  'dash.pending_rent': 'పెండింగ్ అద్దె',
  'dash.checkins_today': 'నేటి చెక్-ఇన్‌లు',
  'dash.checkouts_today': 'నేటి చెక్-అవుట్‌లు',
  'dash.outstanding': 'బకాయిలు',
  'res.title': 'నివాసులు',
  'res.add': '➕ కొత్త నివాసి',
  'res.filter.active': 'క్రియాశీలం',
  'res.filter.notice': 'నోటీసు ఇచ్చారు',
  'res.filter.checked_out': 'వెళ్ళిపోయారు',
  'res.filter.all': 'అన్నీ',
  'res.search_placeholder': 'పేరు లేదా ఫోన్ ద్వారా వెతకండి',
  'res.give_notice': 'నోటీసు నమోదు',
  'res.checkout': 'చెక్ అవుట్',
  'res.record_payment': '💰 డబ్బు తీసుకోండి',
  'res.profile': 'ప్రొఫైల్',
  'res.payments': 'చెల్లింపులు',
  'rent.this_month': 'ఈ నెల',
  'rent.outstanding': 'బకాయి: {{amount}}',
  'rent.pay': 'చెల్లించు',
  'rent.mode_cash': 'క్యాష్',
  'rent.mode_upi': 'యూపీఐ',
  'rent.mode_bank': 'బ్యాంక్',
  'rooms.legend.vacant': 'ఖాళీ',
  'rooms.legend.reserved': 'రిజర్వ్',
  'rooms.legend.occupied': 'నిండింది',
  'rooms.legend.maintenance': 'మెయింటెనెన్స్',
  'rooms.available_now': 'ఇప్పుడు ఖాళీ',
  'rooms.upcoming': 'త్వరలో ఖాళీ',
  'set.title': 'సెట్టింగ్‌లు',
  'set.language': 'భాష',
  'set.simple_mode': 'సింపుల్ మోడ్',
  'set.voice_guidance': 'వాయిస్ మార్గదర్శనం',
  'set.property': 'ఆస్తి',
};

export const i18n = new I18n({ en, hi, te });
// Fallback chain: missing hi/te keys fall back to en automatically.
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// `Localization.getLocales()` is a sync native call; on some Android cold
// starts the native module isn't ready yet and throws — which would crash
// the JS bundle at module-load time (before our ErrorBoundary mounts).
// Guard so the worst case is just "default to English".
function detectInitialLocale(): 'en' | 'hi' | 'te' {
  try {
    const code = Localization.getLocales()[0]?.languageCode;
    if (code === 'hi' || code === 'te') return code;
  } catch {
    /* fall through */
  }
  return 'en';
}
i18n.locale = detectInitialLocale();

export type Lang = 'en' | 'hi' | 'te';

export function setLocale(lang: Lang) {
  i18n.locale = lang;
}

export function t(key: keyof typeof en, vars?: Record<string, string | number>): string {
  return i18n.t(key, vars);
}
