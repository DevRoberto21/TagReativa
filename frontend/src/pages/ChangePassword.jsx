import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Page from '../components/ui/Page';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { PASSWORD_POLICY_MESSAGE, meetsPasswordPolicy } from '../utils/passwordPolicy';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (!meetsPasswordPolicy(newPassword)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (newPassword !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
      // The change signs out every other session; this token keeps this one.
      localStorage.setItem('access_token', data.access_token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setSuccess(true);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) setError('Senha atual incorreta.');
      else if (status === 429) setError('Muitas tentativas. Aguarde um minuto e tente de novo.');
      else setError('Erro ao alterar a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Alterar Senha" onBack={() => navigate('/perfil')} />

      <Panel>
        <form onSubmit={handleSubmit} className="stack">
          <Field
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
          />
          <Field
            label="Nova senha (mín. 8, letra e número)"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <Field
            label="Confirmar nova senha"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={8}
          />

          <Notice>
            Ao alterar a senha, as sessões abertas em outros dispositivos são encerradas.
          </Notice>

          {error && <Notice tone="error">{error}</Notice>}
          {success && <Notice tone="success">Senha alterada com sucesso.</Notice>}

          <Button type="submit" block disabled={submitting}>
            {submitting ? 'Salvando...' : 'Alterar Senha'}
          </Button>
        </form>
      </Panel>
    </Page>
  );
}
