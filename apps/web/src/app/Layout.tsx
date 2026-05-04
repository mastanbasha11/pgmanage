import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  IndianRupee,
  Receipt,
  UserCircle,
  LogOut,
  Bell,
  Menu,
  X,
  ChevronDown,
  UserCog,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useProperties } from '@/hooks/useProperties';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true, ownerOnly: true },
  { to: '/properties', icon: Building2, label: 'Properties' },
  { to: '/tenants', icon: Users, label: 'Tenants' },
  { to: '/rent', icon: IndianRupee, label: 'Rent & Payments' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/leads', icon: UserCircle, label: 'Leads' },
  { to: '/settings/team', icon: UserCog, label: 'Team', ownerOnly: true },
];

interface Props {
  children: React.ReactNode;
}

export default function Layout({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, selectedPropertyId, setSelectedProperty, canAccessFinancials } =
    useAuthStore();
  const navigate = useNavigate();
  const { data: propertiesData } = useProperties();

  const properties = propertiesData?.items ?? [];
  const activePropertyId = selectedPropertyId ?? properties[0]?.id ?? '';

  // Auto-select the first property in the global store when properties first load
  // and nothing is selected, OR when the previously selected property no longer exists.
  useEffect(() => {
    if (properties.length === 0) return;
    const stillExists =
      selectedPropertyId && properties.some((p: { id: string }) => p.id === selectedPropertyId);
    if (!stillExists) {
      setSelectedProperty(properties[0].id);
    }
  }, [properties, selectedPropertyId, setSelectedProperty]);

  function handleLogout() {
    logout();
    navigate('/auth/login');
  }

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.ownerOnly && !canAccessFinancials()) return false;
    return true;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-primary text-primary-foreground transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold">
              P
            </div>
            <span className="text-lg font-semibold tracking-tight">PGManage</span>
          </div>
          <button
            className="lg:hidden text-white/60 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Property Switcher */}
        {properties.length > 0 && (
          <div className="px-4 py-3 border-b border-white/10">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
              Property
            </p>
            <Select
              value={activePropertyId}
              onValueChange={setSelectedProperty}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm hover:bg-white/10 focus:ring-accent">
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p: { id: string; name: string }) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {visibleNav.map(({ to, icon: Icon, label, exact }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground shadow-sm'
                        : 'text-white/70 hover:bg-white/5 hover:text-white',
                    )
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
                {initials(user?.name ?? 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-white/50">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/60 hover:text-white transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b bg-background px-4 lg:px-6">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 lg:hidden" />

          <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
            {properties.length > 0 && (
              <>
                <span className="text-foreground font-medium">
                  {properties.find((p: { id: string }) => p.id === activePropertyId)?.name ??
                    properties[0]?.name}
                </span>
                <span aria-hidden>·</span>
                <span className="text-xs">{properties.length} {properties.length === 1 ? 'property' : 'properties'}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 hidden lg:flex h-9">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
                      {initials(user?.name ?? 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{user?.name}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
