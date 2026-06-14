/**
 * Tenant portal — public /portal/* surface.
 *
 * Routing tree:
 *   /portal/login                          public
 *   /portal/                               under TenantPortalLayout (sidebar nav)
 *     home                                 Home dashboard
 *     pay                                  Itemised dues + history + My Stay
 *     food                                 Weekly menu
 *     services                             Categories + recent tickets
 *     services/new                         Raise a ticket
 *     services/tickets/:id                 Status timeline + rate/reopen
 *     more                                 Grid into secondary screens
 *     visitors / safety / notice           — Stay group
 *     community / referral                 — Community group
 *     notifications / notices              — Updates group
 *     support / feedback                   — Help group
 *     profile / profile/edit / settings    — You group
 *
 * The legacy TenantHome.tsx is retained but unused — kept temporarily so
 * any bookmark to /portal/home from before this refactor still resolves
 * (the new HomeScreen replaces it).
 */
import { Navigate, Route, Routes } from 'react-router-dom';

import TenantLogin from './TenantLogin';
import TenantPortalLayout from './layout/TenantPortalLayout';
import CommunityScreen from './screens/CommunityScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import FoodScreen from './screens/FoodScreen';
import HomeScreen from './screens/HomeScreen';
import MoreScreen from './screens/MoreScreen';
import NewTicketScreen from './screens/NewTicketScreen';
import NoticesScreen from './screens/NoticesScreen';
import NoticeScreen from './screens/NoticeScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import PayScreen from './screens/PayScreen';
import ProfileEditScreen from './screens/ProfileEditScreen';
import ProfileScreen from './screens/ProfileScreen';
import ReferralScreen from './screens/ReferralScreen';
import SafetyScreen from './screens/SafetyScreen';
import ServicesScreen from './screens/ServicesScreen';
import SettingsScreen from './screens/SettingsScreen';
import SupportScreen from './screens/SupportScreen';
import TicketDetailScreen from './screens/TicketDetailScreen';
import VisitorsScreen from './screens/VisitorsScreen';

function TenantPrivate({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('tenant_access_token');
  if (!token) return <Navigate to="/portal/login" replace />;
  return <>{children}</>;
}

export default function TenantPortalApp() {
  return (
    <Routes>
      <Route path="login" element={<TenantLogin />} />

      <Route
        path="/"
        element={
          <TenantPrivate>
            <TenantPortalLayout />
          </TenantPrivate>
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<HomeScreen />} />
        <Route path="pay" element={<PayScreen />} />
        <Route path="food" element={<FoodScreen />} />
        <Route path="services" element={<ServicesScreen />} />
        <Route path="services/new" element={<NewTicketScreen />} />
        <Route path="services/tickets/:id" element={<TicketDetailScreen />} />
        <Route path="more" element={<MoreScreen />} />
        <Route path="visitors" element={<VisitorsScreen />} />
        <Route path="safety" element={<SafetyScreen />} />
        <Route path="notice" element={<NoticeScreen />} />
        <Route path="community" element={<CommunityScreen />} />
        <Route path="referral" element={<ReferralScreen />} />
        <Route path="notifications" element={<NotificationsScreen />} />
        <Route path="notices" element={<NoticesScreen />} />
        <Route path="support" element={<SupportScreen />} />
        <Route path="feedback" element={<FeedbackScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
        <Route path="profile/edit" element={<ProfileEditScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Route>
    </Routes>
  );
}
