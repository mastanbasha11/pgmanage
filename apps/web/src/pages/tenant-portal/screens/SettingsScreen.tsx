/**
 * Settings — language (informational only on web for now; the native
 * app handles the locale switch). Theme follows the OS.
 */
import { Globe } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

import { PageHeader, SectionHeader } from './_shared';

export default function SettingsScreen() {
  return (
    <div>
      <PageHeader title="Settings" />

      <SectionHeader title="Language" />
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          <Globe className="mb-2 h-5 w-5 text-accent" />
          <p>
            Use your browser's language settings. Server-side translations land alongside
            the native-app locale switch in a future release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
