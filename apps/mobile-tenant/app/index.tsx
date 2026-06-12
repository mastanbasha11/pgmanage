/**
 * Root route — synchronous Redirect so the user never sees the "Unmatched
 * Route" sitemap on cold start (same bug we hit in the staff app).
 *
 * The token state was hydrated from SecureStore in `_layout.tsx`'s root
 * effect before `ready` flips true and this component is reachable, so
 * reading directly from the store here is correct.
 */
import { Redirect } from 'expo-router';

import { useAppStore } from '../lib/store';

export default function Index() {
  const token = useAppStore((s) => s.accessToken);
  return <Redirect href={token ? '/home' : '/auth/login'} />;
}
