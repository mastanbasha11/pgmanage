/**
 * Tenant-app i18n.
 *
 * Day-1 languages: en (default), hi, te. Keys are flat-dotted strings; we
 * set `defaultSeparator = '\x1f'` so the dots in keys aren't treated as
 * nested-path separators by i18n-js (the bug that made every key render as
 * `[missing "en.foo.bar"]` in the staff app on first ship).
 */
import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

const en = {
  // Onboarding / auth
  'auth.welcome': 'Welcome',
  'auth.signin_prompt': 'Sign in with your registered phone number',
  'auth.phone_label': 'Phone number',
  'auth.phone_placeholder': 'e.g. 98765 43210',
  'auth.send_code': 'Send code',
  'auth.code_sent_email': 'A 6-digit code has been sent to {{to}}',
  'auth.no_email_help':
    'No email on file. Ask your PG owner to add an email, or for a one-time code from their app.',
  'auth.code_label': 'Enter 6-digit code',
  'auth.verify': 'Verify',
  'auth.resend': 'Resend code',
  'auth.pick_org': 'Pick your PG',
  'auth.pick_org_help': 'You belong to more than one PG. Choose which one to enter.',
  'auth.invalid_code': 'That code didn’t work. Try again.',
  'auth.expired_code': 'The code has expired. Tap “Resend code”.',

  // Home / pending actions
  'home.greeting': 'Hi, {{name}}',
  'home.greeting_anon': 'Hi there',
  'home.welcome_to': 'Welcome to {{org}}',
  'home.dues': 'Dues',
  'home.complaints': 'Complaints',
  'home.notices': 'Notices',
  'home.menu_today': 'Today’s menu',
  'home.empty': 'Nothing to do right now.',

  // Common
  'common.continue': 'Continue',
  'common.cancel': 'Cancel',
  'common.retry': 'Try again',
  'common.signout': 'Sign out',
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong.',
  'common.see_all': 'See all',
  'common.empty_default_title': 'Nothing here yet',
  'common.empty_default_message': 'When there’s something new, it’ll show up here.',

  // Status pill labels — shared vocabulary, used by Pay, Tickets, Referrals.
  'status.paid': 'Paid',
  'status.due': 'Due',
  'status.overdue': 'Overdue',
  'status.partial': 'Partial',
  'status.in_progress': 'In progress',
  'status.resolved': 'Resolved',
  'status.raised': 'Raised',
  'status.assigned': 'Assigned',
  'status.reopened': 'Reopened',
  'status.pending': 'Pending',
  'status.credited': 'Credited',
  'status.invited': 'Invited',
  'status.signed_up': 'Signed up',
  'status.moved_in': 'Moved in',

  // Theme settings — surfaced in Phase 9 Profile screen.
  'theme.title': 'Appearance',
  'theme.system': 'Use system',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  // Onboarding.
  'onboarding.welcome.headline': 'Welcome, {{name}}',
  'onboarding.welcome.subtitle':
    'Let’s get you set up at {{property}}. Three quick steps — under a minute.',
  'onboarding.welcome.cta': 'Let’s go',
  'onboarding.step_label': 'Step {{step}} of {{total}}',
  'onboarding.profile.title': 'About you',
  'onboarding.profile.emergency_heading': 'Emergency contact',
  'onboarding.profile.emergency_subtitle': 'Someone we can call if you ever need help.',
  'onboarding.vehicle.title': 'Your vehicle',
  'onboarding.vehicle.subtitle':
    'We share your plate with gate security so they can recognise you on entry.',
  'onboarding.vehicle.none': 'No vehicle',
  'onboarding.vehicle.two_wheeler': 'Two-wheeler',
  'onboarding.vehicle.four_wheeler': 'Four-wheeler',
  'onboarding.vehicle.registration': 'Registration number',
  'onboarding.id.title': 'ID proof',
  'onboarding.id.headline': 'Already with your PG owner',
  'onboarding.id.subtitle':
    'Your manager captured your ID at check-in. You can skip this for now; if you ever need to re-upload, you’ll find it under Profile → ID proof.',
  'onboarding.id.upload_soon':
    'Aadhaar / passport / DL upload from your phone is coming in the next release.',
  'onboarding.finish': 'Finish setup',
  'onboarding.continue': 'Continue',
  'onboarding.toast.signed_in': 'Signed in',
  'onboarding.toast.all_set': 'You’re all set',
};

// Hindi + Telugu dictionaries are deliberately Partial — i18n.enableFallback
// (set below) means any missing key resolves to the English copy. As new
// strings get added per phase, translations land alongside the screen
// that uses them; this keeps Phase 1 unblocked without forcing a sweep.
const hi: Partial<typeof en> = {
  'auth.welcome': 'स्वागत है',
  'auth.signin_prompt': 'अपने पंजीकृत फ़ोन नंबर से साइन-इन करें',
  'auth.phone_label': 'फ़ोन नंबर',
  'auth.phone_placeholder': 'जैसे 98765 43210',
  'auth.send_code': 'कोड भेजें',
  'auth.code_sent_email': '{{to}} पर 6 अंकों का कोड भेजा गया है',
  'auth.no_email_help':
    'ईमेल दर्ज नहीं है. कृपया अपने PG ओनर से ईमेल जोड़ने के लिए कहें, या उनसे एक कोड माँगें.',
  'auth.code_label': '6 अंकों का कोड दर्ज करें',
  'auth.verify': 'सत्यापित करें',
  'auth.resend': 'कोड दोबारा भेजें',
  'auth.pick_org': 'अपना PG चुनें',
  'auth.pick_org_help': 'आप एक से अधिक PG में पंजीकृत हैं. कौन-सा खोलना है?',
  'auth.invalid_code': 'कोड ग़लत है. दोबारा कोशिश करें.',
  'auth.expired_code': 'कोड समाप्त हो गया है. “कोड दोबारा भेजें” पर टैप करें.',

  'home.greeting': 'नमस्ते, {{name}}',
  'home.greeting_anon': 'नमस्ते',
  'home.welcome_to': '{{org}} में आपका स्वागत है',
  'home.dues': 'बकाया',
  'home.complaints': 'शिकायतें',
  'home.notices': 'सूचनाएँ',
  'home.menu_today': 'आज का मेन्यू',
  'home.empty': 'अभी कुछ नहीं है.',

  'common.continue': 'आगे बढ़ें',
  'common.cancel': 'रद्द करें',
  'common.retry': 'पुनः प्रयास',
  'common.signout': 'साइन-आउट',
  'common.loading': 'लोड हो रहा है…',
  'common.error': 'कुछ ग़लत हो गया.',
};

const te: Partial<typeof en> = {
  'auth.welcome': 'స్వాగతం',
  'auth.signin_prompt': 'మీ నమోదిత ఫోన్ నంబర్‌తో సైన్ ఇన్ చేయండి',
  'auth.phone_label': 'ఫోన్ నంబర్',
  'auth.phone_placeholder': 'ఉదా. 98765 43210',
  'auth.send_code': 'కోడ్ పంపండి',
  'auth.code_sent_email': '{{to}}కి 6-అంకెల కోడ్ పంపబడింది',
  'auth.no_email_help':
    'ఈమెయిల్ లేదు. మీ PG యజమానిని ఈమెయిల్ జోడించమని లేదా ఒక కోడ్ ఇవ్వమని అడగండి.',
  'auth.code_label': '6-అంకెల కోడ్ నమోదు చేయండి',
  'auth.verify': 'ధృవీకరించండి',
  'auth.resend': 'కోడ్ మళ్ళీ పంపండి',
  'auth.pick_org': 'మీ PGని ఎంచుకోండి',
  'auth.pick_org_help': 'మీరు ఒకటి కంటే ఎక్కువ PGలలో ఉన్నారు. ఏది తెరవాలి?',
  'auth.invalid_code': 'కోడ్ తప్పు. మళ్ళీ ప్రయత్నించండి.',
  'auth.expired_code': 'కోడ్ గడువు ముగిసింది. “కోడ్ మళ్ళీ పంపండి” నొక్కండి.',

  'home.greeting': 'హాయ్, {{name}}',
  'home.greeting_anon': 'హాయ్',
  'home.welcome_to': '{{org}}కి స్వాగతం',
  'home.dues': 'బకాయిలు',
  'home.complaints': 'ఫిర్యాదులు',
  'home.notices': 'ప్రకటనలు',
  'home.menu_today': 'నేటి మెనూ',
  'home.empty': 'ఇప్పుడు ఏమీ లేదు.',

  'common.continue': 'కొనసాగించు',
  'common.cancel': 'రద్దు',
  'common.retry': 'మళ్ళీ ప్రయత్నించండి',
  'common.signout': 'సైన్ అవుట్',
  'common.loading': 'లోడ్ అవుతోంది…',
  'common.error': 'ఏదో తప్పు జరిగింది.',
};

export const SUPPORTED_LOCALES = ['en', 'hi', 'te'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const i18n = new I18n({ en, hi, te });
// Treat dots in keys as literal — see file-level note.
i18n.defaultSeparator = '\x1f';
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

function pickLocale(): Locale {
  const code = Localization.getLocales()?.[0]?.languageCode ?? 'en';
  return (SUPPORTED_LOCALES as readonly string[]).includes(code) ? (code as Locale) : 'en';
}

i18n.locale = pickLocale();

export function setLocale(locale: Locale) {
  i18n.locale = locale;
}

export function t(key: string, params?: Record<string, string | number>) {
  return i18n.t(key, params);
}
