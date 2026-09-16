import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import PageContainer from '../components/PageContainer';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      navigate('/login');
    } catch {
      setError('Link inválido ou expirado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer style={styles.container}>
      <div style={styles.contentWrapper}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <div>
              <div style={styles.logoTitle}>TagReativa</div>
              <div style={styles.logoSub}>Definir nova senha</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              style={styles.input}
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Confirmar nova senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.button} type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>

          <Link to="/login" style={styles.link}>Voltar para o login</Link>
        </div>
      </div>
    </PageContainer>
  );
}

const styles = {
  container: { position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '24px 16px', width: '100%', display: 'flex', justifyContent: 'center' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.05)', border: '1px solid rgba(255, 255, 255, 0.6)' },
  logo: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px', justifyContent: 'center' },
  logoTitle: { fontSize: '24px', fontWeight: 800, color: '#1B4332', letterSpacing: '-0.5px' },
  logoSub: { fontSize: '12px', color: '#52796F', fontWeight: 500, marginTop: '2px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: { padding: '14px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box' },
  button: { padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', marginTop: '6px', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', margin: '4px 0 0', fontWeight: 500 },
  link: { display: 'block', textAlign: 'center', marginTop: '24px', color: '#2D6A4F', fontSize: '13px', fontWeight: 600, textDecoration: 'none' },
};
