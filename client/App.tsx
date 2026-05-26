import './App.css';

import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import StrategyPage from './pages/strategy/StrategyPage';
import InboxPage from './pages/inbox/InboxPage';
import AuthPage from './pages/auth/AuthPage';
import SenderPage from './pages/send/SendPage';
import { autoRecordLive } from './methods/status';

const PrivateRoute = ({ redirectPath = '/auth' }) => {
  // 检查 localStorage 中的 token
  const isAuthenticated = !!localStorage.getItem('token');

  return isAuthenticated ? <Outlet /> : <Navigate to={redirectPath} replace />;
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
        </Route>
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
