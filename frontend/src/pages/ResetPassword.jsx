import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { PASSWORD_POLICY_MESSAGE, meetsPasswordPolicy } from '../utils/passwordPolicy';

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
      await api.post('/auth/reset-password', { token, newPassword });
      navigate('/login');
    } catch {
      setError('Link inválido ou expirado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout tagline="Definir nova senha" footer={<Link to="/login">Voltar para o login</Link>}>
      <form onSubmit={handleSubmit} className="stack">
        <Field
          label="Nova senha (mín. 8, letra e número)"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
        <Field
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Salvando...' : 'Redefinir senha'}
        </Button>
      </form>
    </AuthLayout>
  );
}
