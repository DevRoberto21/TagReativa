import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import api from '../services/api';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';

// The 2FA step slides in from the right and back out the same way.
const stepMotion = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.22 },
};

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [code, setCode] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.twoFactorRequired) {
        setLoginToken(data.loginToken);
        return;
      }
      localStorage.setItem('access_token', data.access_token);
      navigate('/dashboard');
    } catch {
      setError('E-mail ou senha inválidos.');
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login/verify-2fa', {
        loginToken,
        code,
      });
      localStorage.setItem('access_token', data.access_token);
      navigate('/dashboard');
    } catch {
      setError('Código inválido ou expirado.');
    }
  }

  return (
    <AuthLayout
      tagline="Identificação e resgate por QR"
      footer={!loginToken && (
        <>
          <Link to="/register">Solicitar nova credencial — Criar Conta</Link>
          <Link to="/esqueci-senha">Esqueci minha senha</Link>
        </>
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loginToken ? (
          <motion.form key="code" onSubmit={handleVerifyCode} className="stack" {...stepMotion}>
            <Notice>Digite o código de 6 dígitos enviado para seu e-mail.</Notice>
            <Field
              label="Código de verificação"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value)}
              maxLength={6}
              required
            />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" block>Confirmar Código</Button>
            <Button
              variant="secondary"
              block
              onClick={() => {
                setLoginToken('');
                setCode('');
                setError('');
              }}
            >
              Voltar e tentar novamente
            </Button>
          </motion.form>
        ) : (
          <motion.form key="credentials" onSubmit={handleSubmit} className="stack" {...stepMotion}>
            <Field
              label="E-mail corporativo ou pessoal"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <Field
              label="Senha de acesso"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" block>Autenticar Sistema</Button>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
