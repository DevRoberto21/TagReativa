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
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🛡️</span>
          <div>
            <div style={styles.logoTitle}>Pet Rescue</div>
            <div style={styles.logoSub}>Sistema de Identificação e Resgate</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">Entrar</button>
        </form>

        <Link to="/register" style={styles.link}>Não tem uma conta? Criar Conta</Link>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', justifyContent: 'center' },
  logoIcon: { fontSize: '36px' },
  logoTitle: { fontSize: '22px', fontWeight: 'bold', color: '#2563EB' },
  logoSub: { fontSize: '12px', color: '#6B7280' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { padding: '12px 14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' },
  button: { padding: '12px', borderRadius: '8px', background: '#2563EB', color: '#fff', fontWeight: 'bold', fontSize: '15px', border: 'none', cursor: 'pointer', marginTop: '4px' },
  error: { color: '#DC2626', fontSize: '13px' },
  link: { display: 'block', textAlign: 'center', marginTop: '20px', color: '#2563EB', fontSize: '14px' },
};