import './styles/globals.css';

import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import StrategyPage from './pages/strategy/StrategyPage';
import InboxPage from './pages/inbox/InboxPage';
import AuthPage from './pages/auth/AuthPage';
import SenderPage from './pages/send/SendPage';
import SafetyPage from './pages/safety/SafetyPage';
import SettingsPage from './pages/settings/SettingsPage';
import MailboxPage from './pages/mailbox/MailboxPage';
import { AdminLayout } from './components/admin/layout';
import { autoRecordLive } from './methods/status';
import { connectLive } from './lib/livews';
import { AuthRouter } from './api/instance';
import { inTauthSession, setTauth } from './methods/tauth';
import { MailboxRouter } from './api/instance';
import { useLocation, useNavigate } from 'react-router-dom';

const PrivateRoute = ({ redirectPath = '/auth' }) => {
  const token = localStorage.getItem('token');
  const tauth = inTauthSession();
  const [ok, setOk] = useState(!!token || tauth);

  useEffect(() => {
    if (!token || tauth) return;
    AuthRouter.alive({});
    window.addEventListener('alive', (e: any) => {
      if (e.detail?.success) {
        setOk(true);
      } else {
        localStorage.removeItem('token');
        setOk(false);
      }
    }, { once: true });
  }, [token]);

  if (!token && !tauth) return <Navigate to={redirectPath} replace />;
  if (!token) return <Outlet />;
  if (!ok) return null;
  return <Outlet />;
};

/** Captures grant links shaped like /tauth=<token> and opens the temp session. */
const TauthGate = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const match = pathname.match(/^\/tauth=(.+)$/);

  useEffect(() => {
    if (match) {
      setTauth(match[1]);
      MailboxRouter.tauthInfo({}, (res: any) => {
        const info = res?.data || res;
        if (info?.address) {
          localStorage.setItem('tauth_address', info.address);
          setTauth(match[1], info.address);
        }
        navigate('/inbox', { replace: true });
      });
    }
  }, [pathname]);

  if (!match) return <Navigate to="/" replace />;
  return null;
};

const App = () => {
  autoRecordLive();

  useEffect(() => {
    connectLive();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />

        <Route element={<PrivateRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/mailbox" element={<MailboxPage />} />
            <Route path="/strategy" element={<StrategyPage />} />
            <Route path="/send" element={<SenderPage />} />
            <Route path="/safety" element={<SafetyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="*" element={<TauthGate />} />
      </Routes>
    </Router>
  );
};

export default App;
