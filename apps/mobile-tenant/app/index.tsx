/**
 * Root route — synchronous Redirect so the user never sees the
 * "Unmatched Route" sitemap on cold start.
 *
 * Branches:
 *   - No token             → /auth/login
 *   - Token + profile loading → wait (render nothing; loaders show in the
 *     destination screens)
 *   - Token + kycComplete=false → /onboarding/welcome
 *   - Token + kycComplete=true  → /home
 */
import { Redirect } from 'expo-router';

import { useProfile } from '../lib/data/hooks';
import { useAppStore } from '../lib/store';

export default function Index() {
  const token = useAppStore((s) => s.accessToken);
  const { data: profile, isLoading } = useProfile();

  if (!token) return <Redirect href="/auth/login" />;
  // Profile must be loaded before we can route — otherwise we'd flicker
  // home then bounce to onboarding. Returning null shows the splash
  // background; the request resolves in ~250ms with the mock.
  if (isLoading || !profile) return null;
  if (!profile.kycComplete) return <Redirect href="/onboarding/welcome" />;
  return <Redirect href="/home" />;
}
