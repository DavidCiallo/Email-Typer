import './App.css';

import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import StrategyPage from './pages/strategy/StrategyPage';
import InboxPage from './pages/inbox/InboxPage';
import AuthPage from './pages/auth/AuthPage';
import SenderPage from './pages/send/SendPage';
import SafetyPage from './pages/safety/SafetyPage';
import ThirdpartyPage from './pages/thirdparty/ThirdpartyPage';
import SettingsPage from './pages/settings/SettingsPage';
import { autoRecordLive } from './methods/status';
import { AuthRouter } from './api/instance';

const PrivateRoute = ({ redirectPath = '/auth' }) => {
  const token = localStorage.getItem('token');
  const [ok, setOk] = useState(!!token);

  useEffect(() => {
    if (!token) return;
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

  if (!token) return <Navigate to={redirectPath} replace />;
  if (!ok) return null;
  return <Outlet />;
};

const App = () => {
  autoRecordLive();
  return (
    <Router>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />

        <Route element={<PrivateRoute />}>
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/send" element={<SenderPage />} />
          <Route path="/safety" element={<SafetyPage />} />
          <Route path="/thirdparty" element={<ThirdpartyPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
