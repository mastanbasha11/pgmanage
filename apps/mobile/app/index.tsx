/**
 * Root route — handles the OS-level launch URL (`pgmanage:///`).
 *
 * expo-router's auto-typed routes used to include "/" implicitly when the
 * tabs group had an `index.tsx`, but with our nested layout the root path
 * was unmatched on cold start — the user saw the "Unmatched Route" sitemap
 * page for ~1s before AuthGuard's redirect fired. This file makes the
 * redirect synchronous: render-time, before paint.
 *
 * Auth state lives in the persisted Zustand store; we read it directly
 * (not via useAppStore's hook in render with a side-effect) so the
 * Redirect component navigates on the same render the layout is mounted.
 */
import { Redirect } from 'expo-router';

import { useAppStore } from '../lib/store';

export default function Index() {
  const user = useAppStore((s) => s.user);
  return <Redirect href={user ? '/tabs' : '/auth/login'} />;
}
