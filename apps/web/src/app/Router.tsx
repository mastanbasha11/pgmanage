import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { useAuthStore, loadCurrentUser } from '@/store/auth';
import { Toaster } from '@/components/ui/toaster';

import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import Layout from './Layout';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import PropertiesPage from '@/pages/properties/PropertiesPage';
import PropertyDetailPage from '@/pages/properties/PropertyDetailPage';
import TenantsPage from '@/pages/tenants/TenantsPage';
import TenantDetailPage from '@/pages/tenants/TenantDetailPage';
import RentDashboardPage from '@/pages/rent/RentDashboardPage';
import ExpensesPage from '@/pages/expenses/ExpensesPage';
import BookingsPage from '@/pages/bookings/BookingsPage';
import ROIPage from '@/pages/roi/ROIPage';
import LeadsPage from '@/pages/leads/LeadsPage';
import TeamPage from '@/pages/settings/TeamPage';
import AuditLogsPage from '@/pages/audit-logs/AuditLogsPage';
import WebsiteIntegrationPage from '@/pages/settings/WebsiteIntegrationPage';
import WhatsAppPage from '@/pages/settings/WhatsAppPage';
import PaymentsPage from '@/pages/settings/PaymentsPage';
import MessageLogPage from '@/pages/settings/MessageLogPage';
import JobMonitorPage from '@/pages/settings/JobMonitorPage';
import MenuPage from '@/pages/settings/MenuPage';
import InboxPage from '@/pages/inbox/InboxPage';
import PrivacyPage from '@/pages/legal/PrivacyPage';
import TermsPage from '@/pages/legal/TermsPage';
import TenantPortalApp from '@/pages/tenant-portal/TenantPortalApp';

function PrivateRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  if (!token || !user) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('App error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl font-bold">
              !
            </div>
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                this.setState({ error: null });
                window.location.assign('/');
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (token) {
      loadCurrentUser().finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [token]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/auth/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/auth/signup"
            element={
              <PublicOnlyRoute>
                <SignupPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/auth/forgot-password"
            element={
              <PublicOnlyRoute>
                <ForgotPasswordPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

          {/* Public legal pages — referenced by Meta (WhatsApp) + Play Store */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />

          {/* Tenant self-service portal (separate auth) */}
          <Route path="/portal/*" element={<TenantPortalApp />} />

          {/* Protected app routes */}
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Layout>
                  <Routes>
                    <Route index element={<DashboardPage />} />
                    <Route path="properties" element={<PropertiesPage />} />
                    <Route path="properties/:id" element={<PropertyDetailPage />} />
                    <Route path="tenants" element={<TenantsPage />} />
                    <Route path="tenants/:id" element={<TenantDetailPage />} />
                    <Route path="rent" element={<RentDashboardPage />} />
                    <Route path="bookings" element={<BookingsPage />} />
                    <Route path="roi" element={<ROIPage />} />
                    <Route path="expenses" element={<ExpensesPage />} />
                    <Route path="leads" element={<LeadsPage />} />
                    <Route path="settings/team" element={<TeamPage />} />
                    <Route path="settings/website-integration" element={<WebsiteIntegrationPage />} />
                    <Route path="settings/menu" element={<MenuPage />} />
                    <Route path="inbox" element={<InboxPage />} />
                    <Route path="settings/whatsapp" element={<WhatsAppPage />} />
                    <Route path="settings/payments" element={<PaymentsPage />} />
                    <Route path="settings/messages" element={<MessageLogPage />} />
                    <Route path="settings/jobs" element={<JobMonitorPage />} />
                    <Route path="audit-logs" element={<AuditLogsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ErrorBoundary>
  );
}
