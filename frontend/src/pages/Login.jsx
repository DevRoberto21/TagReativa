import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('access_token', data.access_token);
      navigate('/dashboard');
    } catch {
      setError('E-mail ou senha inválidos.');
    }
  }

  return (
    <div style={styles.container}>
      {/* Fundo Orgânico/Futurista Padronizado */}
      <svg style={styles.bgSvg} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,200 C100,250 150,450 50,600 C-50,750 -200,700 -250,550 Z" fill="url(#leafGrad)" opacity="0.4" filter="blur(40px)" />
        <path d="M1500,100 C1350,150 1200,300 1300,500 C1400,700 1550,650 1600,500 Z" fill="url(#leafGrad)" opacity="0.35" filter="blur(50px)" />
        <g stroke="#94D2BD" strokeWidth="1" opacity="0.5" fill="none">
          <circle cx="200" cy="150" r="3" fill="#94D2BD" />
          <circle cx="280" cy="110" r="4" fill="#94D2BD" />
          <line x1="200" y1="150" x2="280" y2="110" />
          <circle cx="1200" cy="400" r="3" fill="#94D2BD" />
          <circle cx="1280" cy="350" r="3" fill="#94D2BD" />
          <line x1="1200" y1="400" x2="1280" y2="350" />
        </g>
        <defs>
          <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#40916C" />
            <stop offset="100%" stopColor="#A9D6E5" />
          </linearGradient>
        </defs>
      </svg>

      <div style={styles.contentWrapper}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c0 2-.52 3.5-1.6 9.2A7 7 0 0 1 11 20z" />
              <path d="M19 2c-2.26 4.33-5.27 7.14-8 10" />
            </svg>
            <div>
              <div style={styles.logoTitle}>TagReativa</div>
              <div style={styles.logoSub}>Identificação e Proteção Biofílica</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              style={styles.input}
              type="email"
              placeholder="E-mail corporativo ou pessoal"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Senha de acesso"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.button} type="submit">Autenticar Sistema</button>
          </form>

          <Link to="/register" style={styles.link}>Solicitar nova credencial — Criar Conta</Link>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  bgSvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '24px 16px', width: '100%', display: 'flex', justifyContent: 'center' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.05)', border: '1px solid rgba(255, 255, 255, 0.6)' },
  logo: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '36px', justifyContent: 'center' },
  logoTitle: { fontSize: '24px', fontWeight: 800, color: '#1B4332', letterSpacing: '-0.5px' },
  logoSub: { fontSize: '12px', color: '#52796F', fontWeight: 500, marginTop: '2px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: { padding: '14px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', transition: 'border-color 0.2s' },
  button: { padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', margin: '4px 0 0', fontWeight: 500 },
  link: { display: 'block', textAlign: 'center', marginTop: '24px', color: '#2D6A4F', fontSize: '13px', fontWeight: 600, textDecoration: 'none' },
};