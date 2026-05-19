import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Profile() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get('/users/me')
      .then(r => {
        setName(r.data.name);
        setWhatsapp(r.data.whatsapp);
        setAge(r.data.age ?? '');
      })
      .catch(() => setError('Erro ao carregar perfil do tutor.'));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    const parsedAge = parseInt(age);
    if (age !== '' && parsedAge < 18) {
      setError('Idade mínima permitida é de 18 anos.');
      return;
    }
    try {
      const payload = { name, whatsapp };
      if (age !== '') payload.age = parsedAge;
      await api.patch('/users/me', payload);
      setSuccess(true);
    } catch {
      setError('Erro ao salvar alterações.');
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Excluir conta permanentemente? Todos os dispositivos vinculados e logs serão removidos do ecossistema de proteção.')) return;
    setDeleting(true);
    try {
      await api.delete('/users/me');
      localStorage.clear();
      navigate('/login');
    } catch {
      setError('Erro ao revogar conta.');
      setDeleting(false);
    }
  }

  return (
    <div style={styles.container}>
      <svg style={styles.bgSvg} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,200 C100,250 150,450 50,600 C-50,750 -200,700 -250,550 Z" fill="url(#leafGrad)" opacity="0.4" filter="blur(40px)" />
        <path d="M1500,100 C1350,150 1200,300 1300,500 C1400,700 1550,650 1600,500 Z" fill="url(#leafGrad)" opacity="0.35" filter="blur(50px)" />
        <defs>
          <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#40916C" /><stop offset="100%" stopColor="#A9D6E5" />
          </linearGradient>
        </defs>
      </svg>

      <div style={styles.contentWrapper}>
        <header style={styles.header}>
          <button onClick={() => navigate('/dashboard')} style={styles.back}>Voltar</button>
          <h1 style={styles.title}>Painel do Tutor</h1>
        </header>

        <div style={styles.card}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>Nome Completo</label>
            <input style={styles.input} value={name} onChange={e => setName(e.target.value)} required />

            <label style={styles.label}>Canal Telefônico / WhatsApp</label>
            <input style={styles.input} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required />

            <label style={styles.label}>Idade (anos)</label>
            <input style={styles.input} type="number" value={age} onChange={e => setAge(e.target.value)} min={18} placeholder="Mínimo 18 anos" />

            <div style={styles.notice}>
              Os canais de comunicação criptografados permanecem privados. Eles só serão visíveis para terceiros que escanearem fisicamente a tag de um pet cujo status operacional esteja explicitamente marcado como "Perdido".
            </div>

            {error && <p style={styles.error}>{error}</p>}
            {success && <p style={styles.success}>Dados salvos no ecossistema.</p>}

            <button style={styles.button} type="submit">Salvar Alterações</button>
          </form>

          <button onClick={() => navigate('/configurar-notificacao')} style={styles.notifButton}>
            Canais de Notificação WhatsApp
          </button>

          <button onClick={handleDeleteAccount} disabled={deleting} style={styles.deleteButton}>
            {deleting ? 'Revogando credenciais...' : 'Excluir Minha Conta Permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  bgSvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '32px 16px', width: '100%', maxWidth: '480px', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' },
  back: { background: 'none', border: 'none', fontSize: '14px', color: '#40665A', cursor: 'pointer', fontWeight: 600, padding: 0 },
  title: { fontSize: '20px', fontWeight: 700, color: '#1B4332', margin: 0, letterSpacing: '-0.5px' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '32px 24px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.04)', border: '1px solid rgba(255, 255, 255, 0.6)' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  label: { fontSize: '12px', fontWeight: 700, color: '#2D6A4F', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { padding: '13px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box', width: '100%' },
  notice: { background: '#EAF7F0', border: '1px solid #C6EDD4', borderRadius: '12px', padding: '12px', fontSize: '12px', color: '#2D6A4F', lineHeight: '1.5', fontWeight: 500 },
  button: { padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', marginTop: '6px' },
  notifButton: { width: '100%', marginTop: '16px', padding: '13px', borderRadius: '12px', background: '#EAF7F0', color: '#2D6A4F', fontWeight: 600, fontSize: '13px', border: '1px solid #C6EDD4', cursor: 'pointer' },
  deleteButton: { width: '100%', marginTop: '12px', padding: '13px', borderRadius: '12px', background: '#FFF5F5', color: '#E63946', fontWeight: 600, fontSize: '13px', border: '1px solid #FED7D7', cursor: 'pointer' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', fontWeight: 500 },
  success: { color: '#2D6A4F', fontSize: '13px', textAlign: 'center', fontWeight: 600 },
};