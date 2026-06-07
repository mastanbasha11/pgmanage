/**
 * Optional voice guidance for semi-literate users. When voiceGuidance is on
 * in the user store, screens call `speak(t('res.title'))` after navigation
 * so users hear what page they're on. Speech runs in the current i18n
 * locale (Hindi voice for hi, Telugu voice for te, etc.).
 */
import * as Speech from 'expo-speech';

import { i18n } from './i18n';

const LANG_VOICE: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
};

export function speak(text: string) {
  if (!text) return;
  Speech.stop();
  Speech.speak(text, {
    language: LANG_VOICE[i18n.locale] ?? 'en-IN',
    rate: 0.95,
    pitch: 1.0,
  });
}

export function stopSpeaking() {
  Speech.stop();
}
