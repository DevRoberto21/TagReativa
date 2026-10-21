import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'motion/react';
import Backdrop from './components/ui/Backdrop';
import ApiProgress from './components/ui/ApiProgress';
import api from './services/api';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import NewPet from './pages/NewPet';
import EditPet from './pages/EditPet';
import Profile from './pages/Profile';
import TwoFactor from './pages/TwoFactor';
import ChangePassword from './pages/ChangePassword';
import ScanPage from './pages/ScanPage';
import TelegramSetup from './pages/TelegramSetup';
import EmailAlertsInfo from './pages/EmailAlertsInfo';
import { isSignedIn } from './utils/session';

function PrivateRoute({ children }) {
  if (!isSignedIn()) return <Navigate to="/login" replace />;
  return children;
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
        <Route path="/s/:petId" element={<ScanPage />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/pets/novo" element={<PrivateRoute><NewPet /></PrivateRoute>} />
        <Route path="/pets/:id/editar" element={<PrivateRoute><EditPet /></PrivateRoute>} />
        <Route path="/perfil" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/perfil/2fa" element={<PrivateRoute><TwoFactor /></PrivateRoute>} />
        <Route path="/perfil/senha" element={<PrivateRoute><ChangePassword /></PrivateRoute>} />
        <Route path="/configurar-notificacao" element={<PrivateRoute><TelegramSetup /></PrivateRoute>} />
        <Route path="/alertas-email" element={<PrivateRoute><EmailAlertsInfo /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

// Wake the sleeping backend while the visitor is still reading or typing.
api.get('/health', { silent: true }).catch(() => {});

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Backdrop />
        <ApiProgress />
        <AnimatedRoutes />
      </BrowserRouter>
    </MotionConfig>
  );
}
