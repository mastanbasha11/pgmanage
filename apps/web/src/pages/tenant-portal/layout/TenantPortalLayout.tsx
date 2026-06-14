/**
 * Tenant Portal layout — sidebar nav + content area.
 *
 * Desktop: persistent left sidebar. Mobile: bottom-aligned hamburger
 * sheet so the layout still feels tap-friendly. The 5 nav groups
 * mirror the native resident-app bottom tabs (Home / Pay / Food /
 * Services / More) so users moving between web + APK have one mental
 * model.
 */
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  CreditCard,
  Home,
  Lock,
  LogOut,
  Menu as MenuIcon,
  MoreHorizontal,
  Utensils,
  Wrench,
  X,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn, initials } from '@/lib/utils';
import { useTenantProfile } from '@/lib/tenant-data/hooks';

const NAV = [
  { to: '/portal/home', label: 'Home', icon: Home },
  { to: '/portal/pay', label: 'Pay', icon: CreditCard },
  { to: '/portal/food', label: 'Food', icon: Utensils },
  { to: '/portal/services', label: 'Services', icon: Wrench },
  { to: '/portal/more', label: 'More', icon: MoreHorizontal },
];

export default function TenantPortalLayout() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: profile } = useTenantProfile();

  function logout() {
    localStorage.removeItem('tenant_access_token');
    navigate('/portal/login');
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top brand bar on mobile + tablet */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          className="rounded-md p-1 hover:bg-white/10"
        >
          {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
        <span className="font-bold">PGManage</span>
        <button
          type="button"
          onClick={() => navigate('/portal/notifications')}
          aria-label="Notifications"
          className="rounded-md p-1 hover:bg-white/10"
        >
          <Bell className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile slide-down nav */}
      {open ? (
        <div className="border-b bg-primary text-primary-foreground lg:hidden">
          <ul className="space-y-1 p-3">
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-white/70 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 flex-shrink-0 border-r bg-primary text-primary-foreground lg:flex lg:min-h-screen lg:flex-col">
          <div className="px-5 py-5">
            <div className="text-lg font-bold tracking-tight">PGManage</div>
            <div className="mt-0.5 text-xs text-primary-foreground/60">Resident portal</div>
          </div>

          <nav className="flex-1 px-3 pb-4">
            <ul className="space-y-1">
              {NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground shadow-sm'
                          : 'text-white/70 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className="h-3 w-3 opacity-50" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
                  {initials(profile?.name ?? 'T')}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {profile?.name ?? '—'}
                </div>
                <div className="truncate text-[11px] text-white/60">
                  {profile?.property.name ?? ''}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={logout}
                className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-1 rounded-md bg-white/5 px-2 py-1.5 text-[11px] text-white/60">
              <Lock className="h-3 w-3" />
              <span>Secure session</span>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-3xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
