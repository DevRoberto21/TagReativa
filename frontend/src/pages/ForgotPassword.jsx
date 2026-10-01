import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
    } catch {
      setError('Não foi possível processar o pedido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout tagline="Recuperar acesso" footer={<Link to="/login">Voltar para o login</Link>}>
      {message ? (
        <Notice tone="success">{message}</Notice>
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <Field
            label="Seu e-mail cadastrado"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" block disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar link de recuperação'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
