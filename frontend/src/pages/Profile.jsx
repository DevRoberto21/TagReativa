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
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [age, setAge] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState('idle');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');

  useEffect(() => {
    api.get('/users/me')
      .then(r => setProfile(r.data))
      .catch(() => setError('Erro ao carregar perfil do tutor.'));
  }, []);

  function startEditing() {
    setName(profile.name);
    setWhatsapp(profile.whatsapp);
    setAge(profile.age ?? '');
    setPassword('');
    setError('');
    setSuccess(false);
    setEditing(true);
  }

  function cancelEditing() {
    setPassword('');
    setError('');
    setEditing(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const parsedAge = parseInt(age);
    if (age !== '' && parsedAge < 18) {
      setError('Idade mínima permitida é de 18 anos.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name, whatsapp, password };
      if (age !== '') payload.age = parsedAge;
      const { data } = await api.patch('/users/me', payload);
      setProfile(current => ({ ...current, ...data }));
      setPassword('');
      setEditing(false);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.status === 403 ? 'Senha incorreta.' : 'Erro ao salvar alterações.');
    } finally {
      setSaving(false);
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

  return (
    <Page>
      <PageHeader title="Painel do Tutor" onBack={() => navigate('/dashboard')} />

      <Panel>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={editing ? 'editing' : 'viewing'} {...swap}>
            {!editing && (
              <div className="stack">
                {profile && (
                  <dl className={styles.data}>
                    <div className={styles.row}>
                      <dt className={styles.term}>Nome Completo</dt>
                      <dd className={styles.value}>{profile.name}</dd>
                    </div>
                    <div className={styles.row}>
                      <dt className={styles.term}>E-mail</dt>
                      <dd className={styles.value}>{profile.email}</dd>
                    </div>
                    <div className={styles.row}>
                      <dt className={styles.term}>Canal Telegram</dt>
                      <dd className={styles.value}>{profile.whatsapp}</dd>
                    </div>
                    <div className={styles.row}>
                      <dt className={styles.term}>Idade (anos)</dt>
                      <dd className={styles.value}>{profile.age ?? 'Não informada'}</dd>
                    </div>
                  </dl>
                )}

                {error && <Notice tone="error">{error}</Notice>}
                {success && <Notice tone="success">Dados salvos no ecossistema.</Notice>}

                <Button block onClick={startEditing} disabled={!profile}>Editar Dados</Button>
              </div>
            )}

            {editing && (
              <form onSubmit={handleSubmit} className="stack">
                <Field label="Nome Completo" value={name} onChange={e => setName(e.target.value)} required />

                <Field label="E-mail" value={profile.email} readOnly hint="O e-mail da conta não pode ser alterado." />

                <Field label="Canal Telegram" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required />

                <Field label="Idade (anos)" type="number" value={age} onChange={e => setAge(e.target.value)} min={18} placeholder="Mínimo 18 anos" />

                <Notice>
                  Os canais de comunicação criptografados permanecem privados. Eles só serão visíveis para terceiros que escanearem fisicamente a tag de um pet cujo status operacional esteja explicitamente marcado como "Perdido".
                </Notice>

                <Field
                  label="Senha atual"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  hint="Necessária para confirmar a alteração."
                  required
                />

                {error && <Notice tone="error">{error}</Notice>}

                <Button type="submit" block disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
                <Button variant="ghost" block onClick={cancelEditing}>Cancelar</Button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </Panel>

      <Panel className={styles.section}>
        <Button variant="secondary" block onClick={() => navigate('/configurar-notificacao')}>
          {profile?.telegramLinked ? 'Alertas no Telegram: ativos' : 'Ativar alertas no Telegram'}
        </Button>

        <div className={styles.divider} />

        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Autenticação em Dois Fatores</span>
          <StatusBadge muted={!profile?.twoFactorEnabled} label={profile?.twoFactorEnabled ? 'Ativado' : 'Desativado'} />
        </div>

        <Button variant="secondary" block onClick={() => navigate('/perfil/2fa')}>
          Gerenciar 2FA
        </Button>

        <div className={styles.divider} />

        <Button variant="secondary" block onClick={() => navigate('/perfil/senha')}>
          Alterar Senha
        </Button>
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
