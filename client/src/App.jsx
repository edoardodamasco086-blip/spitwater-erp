import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Pages
import LoginPage        from './pages/auth/LoginPage';
import DashboardShell   from './components/layout/DashboardShell';
import HomePage         from './pages/dashboard/HomePage';
import AdminHomePage    from './pages/admin/AdminHomePage';
import UsersPage        from './pages/admin/UsersPage';
import ProfilePage      from './pages/dashboard/ProfilePage';
import NotFoundPage     from './pages/NotFoundPage';
import ContactsPage     from './pages/contacts/ContactsPage';

// ── Route guards ───────────────────────────────────────────────
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to={isAdmin ? '/admin' : '/'} replace />;
  return children;
}

function FullPageSpinner() {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0F1E35'
    }}>
      <div className="spinner-lg" />
    </div>
  );
}

// ── App routes ─────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={
        <GuestOnly><LoginPage /></GuestOnly>
      } />

      {/* Protected — all inside DashboardShell (nav + topbar) */}
      <Route path="/" element={
        <RequireAuth><DashboardShell /></RequireAuth>
      }>
        {/* User routes */}
        <Route index element={<HomePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="contacts" element={<ContactsPage />} />

        {/* Admin routes */}
        <Route path="admin" element={
          <RequireAdmin><AdminHomePage /></RequireAdmin>
        } />
        <Route path="admin/users" element={
          <RequireAdmin><UsersPage /></RequireAdmin>
        } />

        {/* 404 inside shell */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
