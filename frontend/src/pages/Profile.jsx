import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import api from '../services/api';
import Page from '../components/ui/Page';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import StatusBadge from '../components/ui/StatusBadge';
import { swap } from '../components/ui/motionPresets';
import styles from './Profile.module.css';

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
    <Page>
      <PageHeader title="Painel do Tutor" onBack={() => navigate('/dashboard')} />

      <Panel>
        <form onSubmit={handleSubmit} className="stack">
          <Field label="Nome Completo" value={name} onChange={e => setName(e.target.value)} required />

          <Field label="Canal Telegram" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required />

          <Field label="Idade (anos)" type="number" value={age} onChange={e => setAge(e.target.value)} min={18} placeholder="Mínimo 18 anos" />

          <Notice>
            Os canais de comunicação criptografados permanecem privados. Eles só serão visíveis para terceiros que escanearem fisicamente a tag de um pet cujo status operacional esteja explicitamente marcado como "Perdido".
          </Notice>

          {error && <Notice tone="error">{error}</Notice>}
          {success && <Notice tone="success">Dados salvos no ecossistema.</Notice>}

          <Button type="submit" block>Salvar Alterações</Button>
        </form>
      </Panel>

      <Panel className={styles.section}>
        <Button variant="secondary" block onClick={() => navigate('/configurar-notificacao')}>
          {telegramLinked ? 'Alertas no Telegram: ativos' : 'Ativar alertas no Telegram'}
        </Button>

        <div className={styles.divider} />

        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Autenticação em Dois Fatores</span>
          <StatusBadge muted={!twoFactorEnabled} label={twoFactorEnabled ? 'Ativado' : 'Desativado'} />
        </div>

        {twoFactorMessage && <Notice tone="error">{twoFactorMessage}</Notice>}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${twoFactorEnabled}-${twoFactorStep}`} {...swap}>
            {!twoFactorEnabled && twoFactorStep === 'idle' && (
              <Button variant="secondary" block onClick={handleEnableTwoFactor}>
                Ativar 2FA
              </Button>
            )}

            {!twoFactorEnabled && twoFactorStep === 'confirming' && (
              <form onSubmit={handleConfirmTwoFactor} className="stack">
                <Field
                  label="Código de 6 dígitos"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  maxLength={6}
                  required
                />
                <Button type="submit" block>Confirmar Ativação</Button>
              </form>
            )}

            {twoFactorEnabled && twoFactorStep === 'idle' && (
              <Button variant="danger" block onClick={() => setTwoFactorStep('disabling')}>
                Desativar 2FA
              </Button>
            )}

            {twoFactorEnabled && twoFactorStep === 'disabling' && (
              <form onSubmit={handleDisableTwoFactor} className="stack">
                <Field
                  label="Senha atual"
                  type="password"
                  autoComplete="current-password"
                  value={twoFactorPassword}
                  onChange={e => setTwoFactorPassword(e.target.value)}
                  required
                />
                <Button type="submit" variant="danger" block>Confirmar Desativação</Button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </Panel>

      <Panel tone="alert">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={deleteStep} {...swap}>
            {deleteStep === 'idle' && (
              <Button variant="danger" block onClick={() => setDeleteStep('confirming')}>
                Excluir Minha Conta Permanentemente
              </Button>
            )}

            {deleteStep === 'confirming' && (
              <form onSubmit={handleDeleteAccount} className="stack">
                <Notice tone="error">
                  Excluir conta permanentemente? Todos os dispositivos vinculados e logs serão removidos do ecossistema de proteção.
                </Notice>
                <Field
                  label="Senha atual"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  required
                />
                {deleteMessage && <Notice tone="error">{deleteMessage}</Notice>}
                <Button type="submit" variant="alert" block disabled={deleting}>
                  {deleting ? 'Revogando credenciais...' : 'Confirmar Exclusão'}
                </Button>
                <Button
                  variant="ghost"
                  block
                  onClick={() => { setDeleteStep('idle'); setDeletePassword(''); setDeleteMessage(''); }}
                >
                  Cancelar
                </Button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </Panel>
    </Page>
  );
}
