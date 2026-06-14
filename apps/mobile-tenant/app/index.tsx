/**
 * Root route — synchronous Redirect.
 *
 * Post-login UX rule: once we have a token, the user lands on Home. KYC
 * completion is a Home nudge, NOT a routing gate. Forcing an onboarding
 * flow between OTP-verify and Home felt jarring + makes the app look
 * incomplete on first impression. See project memory:
 * project-resident-post-login-ux.
 */
import { Redirect } from 'expo-router';

import { useAppStore } from '../lib/store';

export default function Index() {
  const token = useAppStore((s) => s.accessToken);
  if (!token) return <Redirect href="/auth/login" />;
  return <Redirect href="/home" />;
}
