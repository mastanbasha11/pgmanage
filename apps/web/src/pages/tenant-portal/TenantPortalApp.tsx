import { Routes, Route, Navigate } from 'react-router-dom';
import TenantLogin from './TenantLogin';
import TenantHome from './TenantHome';

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
        path="home"
        element={
          <TenantPrivate>
            <TenantHome />
          </TenantPrivate>
        }
      />
      <Route index element={<Navigate to="login" replace />} />
    </Routes>
  );
}
