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

const RESEND_COOLDOWN_SECONDS = 60;

export default function TwoFactor() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    api.get('/users/me')
      .then(r => {
        setEnabled(r.data.twoFactorEnabled);
        setEmail(r.data.email);
        setLoaded(true);
      })
      .catch(() => setError('Erro ao carregar o status do 2FA.'));
  }, []);

  // Counts the resend wait down one second at a time.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSendCode() {
    setError('');
    setSuccess('');
    setSending(true);
    try {
      await api.post('/auth/2fa/enable');
      setStep('confirming');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(
        err.response?.status === 429
          ? 'Muitos códigos solicitados. Aguarde um minuto e tente de novo.'
          : 'Erro ao solicitar código de confirmação.',
      );
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/2fa/confirm', { code });
      setEnabled(true);
      setStep('idle');
      setCode('');
      setSuccess('Autenticação em dois fatores ativada.');
    } catch {
      setError('Código inválido ou expirado.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/2fa/disable', { password });
      setEnabled(false);
      setStep('idle');
      setPassword('');
      setSuccess('Autenticação em dois fatores desativada.');
    } catch {
      setError('Senha incorreta.');
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setStep('idle');
    setCode('');
    setPassword('');
    setError('');
  }

  return (
    <Page>
      <PageHeader title="Dois Fatores" onBack={() => navigate('/perfil')} />

      <Panel className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Autenticação em Dois Fatores</span>
          {loaded && <StatusBadge muted={!enabled} label={enabled ? 'Ativado' : 'Desativado'} />}
        </div>

        <p className={styles.text}>
          Com o 2FA ativo, cada login pede um código de 6 dígitos enviado para {email ? <strong>{email}</strong> : 'o seu e-mail'}.
        </p>

        {error && <Notice tone="error">{error}</Notice>}
        {success && <Notice tone="success">{success}</Notice>}

        {loaded && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${enabled}-${step}`} {...swap}>
              {!enabled && step === 'idle' && (
                <Button block onClick={handleSendCode} disabled={sending}>
                  {sending ? 'Enviando...' : 'Enviar código por e-mail'}
                </Button>
              )}

              {!enabled && step === 'confirming' && (
                <form onSubmit={handleConfirm} className="stack">
                  <Notice>
                    Código enviado. A entrega pode levar até 1 minuto; confira também a caixa de spam. Válido por 5 minutos.
                  </Notice>
                  <Field
                    label="Código de 6 dígitos"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    maxLength={6}
                    required
                  />
                  <Button type="submit" block disabled={submitting}>
                    {submitting ? 'Confirmando...' : 'Confirmar Ativação'}
                  </Button>
                  <Button variant="secondary" block onClick={handleSendCode} disabled={sending || cooldown > 0}>
                    {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}
                  </Button>
                  <Button variant="ghost" block onClick={cancel}>Cancelar</Button>
                </form>
              )}

              {enabled && step === 'idle' && (
                <Button variant="danger" block onClick={() => { setSuccess(''); setStep('disabling'); }}>
                  Desativar 2FA
                </Button>
              )}

              {enabled && step === 'disabling' && (
                <form onSubmit={handleDisable} className="stack">
                  <Field
                    label="Senha atual"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <Button type="submit" variant="danger" block disabled={submitting}>
                    {submitting ? 'Desativando...' : 'Confirmar Desativação'}
                  </Button>
                  <Button variant="ghost" block onClick={cancel}>Cancelar</Button>
                </form>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </Panel>
    </Page>
  );
}
