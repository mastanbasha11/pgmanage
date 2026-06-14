/**
 * Food — weekly menu file (PDF/image) the owner uploaded via
 * /settings/menu, plus per-day meal schedule (empty for now).
 */
import { format, parseISO } from 'date-fns';
import { FileText, ImageIcon, Utensils } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useTenantCurrentMenu,
  useTenantMealsThisWeek,
} from '@/lib/tenant-data/hooks';

import { EmptyState, PageHeader, SectionHeader, SkeletonLines, StatusPill } from './_shared';

export default function FoodScreen() {
  const menuQ = useTenantCurrentMenu();
  const mealsQ = useTenantMealsThisWeek();

  return (
    <div>
      <PageHeader title="Food" subtitle="Weekly menu and your meal preferences" />

      {/* Menu file */}
      {menuQ.isLoading ? (
        <SkeletonLines count={4} />
      ) : !menuQ.data ? (
        <EmptyState
          icon={<Utensils className="h-6 w-6" />}
          title="No menu posted yet"
          message="Your PG manager will upload the weekly menu here soon. Pull down to refresh once it's up."
        />
      ) : (
        <MenuCard menu={menuQ.data} />
      )}

      {/* This week */}
      <SectionHeader title="This week" subtitle="Day by day" />
      {mealsQ.isLoading ? (
        <SkeletonLines count={3} />
      ) : (mealsQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Utensils className="h-6 w-6" />}
          title="No meal schedule yet"
          message="The day-by-day meal schedule will appear here once your PG sets up meal planning."
        />
      ) : null}
    </div>
  );
}

function MenuCard({ menu }: { menu: NonNullable<ReturnType<typeof useTenantCurrentMenu>['data']> }) {
  const isImage = menu.content_type.startsWith('image/');
  return (
    <Card className="overflow-hidden border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Week of {format(parseISO(menu.week_start_date), 'd MMM')}
          </p>
          {menu.is_current_week ? (
            <StatusPill label="Current" tone="success" />
          ) : (
            <StatusPill label="Last week" tone="warning" />
          )}
        </div>
        <h3 className="mt-1 text-xl font-bold">{menu.title ?? "This week's menu"}</h3>

        {isImage ? (
          <a
            href={menu.url}
            target="_blank"
            rel="noopener"
            className="mt-4 block overflow-hidden rounded-xl border bg-muted"
          >
            <img
              src={menu.url}
              alt="Weekly menu"
              className="h-auto w-full max-h-[420px] object-contain"
            />
          </a>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-muted/50 p-8">
            <FileText className="h-10 w-10 text-accent" />
            <p className="text-sm font-semibold">PDF menu</p>
            <p className="text-xs text-muted-foreground">Open in a new tab to view full.</p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <a href={menu.url} target="_blank" rel="noopener">
            <Button className="gap-2">
              {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              Open full menu
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
