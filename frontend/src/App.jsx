import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'motion/react';
import api from './services/api';
import Backdrop from './components/ui/Backdrop';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import NewPet from './pages/NewPet';
import EditPet from './pages/EditPet';
import Profile from './pages/Profile';
import ScanPage from './pages/ScanPage';
import TelegramSetup from './pages/TelegramSetup';
import EmailAlertsInfo from './pages/EmailAlertsInfo';

// Telegram is the mandatory alert channel: logged-in pages stay locked until
// the owner links it. Checked on every page so a later /stop in the bot also
// sends the owner back to the setup screen.
function TelegramGate({ children }) {
  const [linked, setLinked] = useState(null);

  useEffect(() => {
    api.get('/users/me')
      .then(r => setLinked(r.data.telegramLinked))
      // A 401 is handled by the api interceptor; other failures should not
      // lock the owner out of the app.
      .catch(() => setLinked(true));
  }, []);

  if (linked === null) return null;
  return linked
    ? children
    : <Navigate to="/configurar-notificacao" replace state={{ required: true }} />;
}

function PrivateRoute({ children, requireTelegram = true }) {
  const token = localStorage.getItem('access_token');
  if (!token) return <Navigate to="/login" replace />;
  return requireTelegram ? <TelegramGate>{children}</TelegramGate> : children;
}

// Keyed on the pathname so the outgoing page can play its exit animation
// before the next one mounts.
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/scan/:petId" element={<ScanPage />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/pets/novo" element={<PrivateRoute><NewPet /></PrivateRoute>} />
        <Route path="/pets/:id/editar" element={<PrivateRoute><EditPet /></PrivateRoute>} />
        <Route path="/perfil" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/configurar-notificacao" element={<PrivateRoute requireTelegram={false}><TelegramSetup /></PrivateRoute>} />
        <Route path="/alertas-email" element={<PrivateRoute><EmailAlertsInfo /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Backdrop />
        <AnimatedRoutes />
      </BrowserRouter>
    </MotionConfig>
  );
}
