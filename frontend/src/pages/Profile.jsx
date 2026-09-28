import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import PageContainer from '../components/PageContainer';

export default function Profile() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState('idle');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState('idle');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorMessage, setTwoFactorMessage] = useState('');

  useEffect(() => {
    api.get('/users/me')
      .then(r => {
        setName(r.data.name);
        setWhatsapp(r.data.whatsapp);
        setAge(r.data.age ?? '');
        setTwoFactorEnabled(r.data.twoFactorEnabled);
        setTelegramLinked(r.data.telegramLinked);
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

  async function handleDeleteAccount(e) {
    e.preventDefault();
    setDeleteMessage('');
    setDeleting(true);
    try {
      await api.delete('/users/me', { data: { password: deletePassword } });
      localStorage.clear();
      navigate('/login');
    } catch (err) {
      setDeleteMessage(err.response?.status === 403 ? 'Senha incorreta.' : 'Erro ao revogar conta.');
      setDeleting(false);
    }
  }

  async function handleEnableTwoFactor() {
    setTwoFactorMessage('');
    try {
      await api.post('/auth/2fa/enable');
      setTwoFactorStep('confirming');
    } catch {
      setTwoFactorMessage('Erro ao solicitar código de confirmação.');
    }
  }

  async function handleConfirmTwoFactor(e) {
    e.preventDefault();
    setTwoFactorMessage('');
    try {
      await api.post('/auth/2fa/confirm', { code: twoFactorCode });
      setTwoFactorEnabled(true);
      setTwoFactorStep('idle');
      setTwoFactorCode('');
    } catch {
      setTwoFactorMessage('Código inválido ou expirado.');
    }
  }

  async function handleDisableTwoFactor(e) {
    e.preventDefault();
    setTwoFactorMessage('');
    try {
      await api.post('/auth/2fa/disable', { password: twoFactorPassword });
      setTwoFactorEnabled(false);
      setTwoFactorStep('idle');
      setTwoFactorPassword('');
    } catch {
      setTwoFactorMessage('Senha incorreta.');
    }
  }

  return (
    <PageContainer style={styles.container}>
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

            <label style={styles.label}>Canal Telegram</label>
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
            {telegramLinked ? 'Alertas no Telegram: ativos' : 'Ativar alertas no Telegram'}
          </button>

          <div style={styles.twoFactorSection}>
            <div style={styles.twoFactorHeader}>
              <span style={styles.label}>Autenticação em Dois Fatores</span>
              <span style={twoFactorEnabled ? styles.badgeOn : styles.badgeOff}>
                {twoFactorEnabled ? 'Ativado' : 'Desativado'}
              </span>
            </div>

            {twoFactorMessage && <p style={styles.error}>{twoFactorMessage}</p>}

            {!twoFactorEnabled && twoFactorStep === 'idle' && (
              <button type="button" onClick={handleEnableTwoFactor} style={styles.notifButton}>
                Ativar 2FA
              </button>
            )}

            {!twoFactorEnabled && twoFactorStep === 'confirming' && (
              <form onSubmit={handleConfirmTwoFactor} style={styles.form}>
                <input
                  style={styles.input}
                  type="text"
                  inputMode="numeric"
                  placeholder="Código de 6 dígitos"
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  maxLength={6}
                  required
                />
                <button style={styles.button} type="submit">Confirmar Ativação</button>
              </form>
            )}

            {twoFactorEnabled && twoFactorStep === 'idle' && (
              <button type="button" onClick={() => setTwoFactorStep('disabling')} style={styles.deleteButton}>
                Desativar 2FA
              </button>
            )}

            {twoFactorEnabled && twoFactorStep === 'disabling' && (
              <form onSubmit={handleDisableTwoFactor} style={styles.form}>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="Senha atual"
                  value={twoFactorPassword}
                  onChange={e => setTwoFactorPassword(e.target.value)}
                  required
                />
                <button style={styles.deleteButton} type="submit">Confirmar Desativação</button>
              </form>
            )}
          </div>

          {deleteStep === 'idle' && (
            <button type="button" onClick={() => setDeleteStep('confirming')} style={styles.deleteButton}>
              Excluir Minha Conta Permanentemente
            </button>
          )}

          {deleteStep === 'confirming' && (
            <form onSubmit={handleDeleteAccount} style={styles.form}>
              <p style={styles.error}>
                Excluir conta permanentemente? Todos os dispositivos vinculados e logs serão removidos do ecossistema de proteção.
              </p>
              <input
                style={styles.input}
                type="password"
                placeholder="Senha atual"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                required
              />
              {deleteMessage && <p style={styles.error}>{deleteMessage}</p>}
              <button style={styles.deleteButton} type="submit" disabled={deleting}>
                {deleting ? 'Revogando credenciais...' : 'Confirmar Exclusão'}
              </button>
              <button
                type="button"
                onClick={() => { setDeleteStep('idle'); setDeletePassword(''); setDeleteMessage(''); }}
                style={styles.back}
              >
                Cancelar
              </button>
            </form>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

const styles = {
  container: { position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
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
  twoFactorSection: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E2ECE9', display: 'flex', flexDirection: 'column', gap: '10px' },
  twoFactorHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  badgeOn: { fontSize: '11px', fontWeight: 700, color: '#2D6A4F', background: '#EAF7F0', padding: '4px 10px', borderRadius: '999px' },
  badgeOff: { fontSize: '11px', fontWeight: 700, color: '#8A8F8C', background: '#F1F3F2', padding: '4px 10px', borderRadius: '999px' },
  deleteButton: { width: '100%', marginTop: '12px', padding: '13px', borderRadius: '12px', background: '#FFF5F5', color: '#E63946', fontWeight: 600, fontSize: '13px', border: '1px solid #FED7D7', cursor: 'pointer' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', fontWeight: 500 },
  success: { color: '#2D6A4F', fontSize: '13px', textAlign: 'center', fontWeight: 600 },
};