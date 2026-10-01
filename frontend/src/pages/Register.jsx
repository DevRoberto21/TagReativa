import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import { PASSWORD_POLICY_MESSAGE, meetsPasswordPolicy } from '../utils/passwordPolicy';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '', password: '', confirm: '', age: '' });
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!meetsPasswordPolicy(form.password)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (form.password !== form.confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    const age = parseInt(form.age);
    if (!form.age || age < 18) {
      setError('Você precisa ter pelo menos 18 anos.');
      return;
    }
    try {
      const digits = form.whatsapp.replace(/\D/g, '');
      const normalized = digits.length === 11 ? digits.slice(0, 2) + digits.slice(3) : digits;
      await api.post('/users/register', {
        name: form.name,
        email: form.email,
        whatsapp: '55' + normalized,
        password: form.password,
        age,
      });
    } catch {
      setError('Erro ao criar conta. Verifique os dados.');
      return;
    }
    try {
      // New accounts never have 2FA on, so login returns the token directly.
      const { data } = await api.post('/auth/login', { email: form.email, password: form.password });
      localStorage.setItem('access_token', data.access_token);
      navigate('/configurar-notificacao', { state: { onboarding: true } });
    } catch {
      navigate('/login');
    }
  }

  return (
    <AuthLayout
      tagline="Criar credencial de tutor"
      footer={<Link to="/login">Já possui conta vinculada? Acessar</Link>}
    >
      <form onSubmit={handleSubmit} className="stack">
        <Field label="Nome Completo" name="name" autoComplete="name" value={form.name} onChange={handleChange} required />
        <Field label="E-mail de contato" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} required />
        <Field
          label="WhatsApp"
          name="whatsapp"
          prefix="+55"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="DDD + Número (ex: 83912345678)"
          value={form.whatsapp}
          onChange={handleChange}
          required
        />
        <Field label="Idade (Mínimo 18 anos)" name="age" type="number" value={form.age} onChange={handleChange} min={18} required />
        <Field label="Definir Senha (mín. 8, letra e número)" name="password" type="password" autoComplete="new-password" value={form.password} onChange={handleChange} required minLength={8} />
        <Field label="Confirmar Senha" name="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={handleChange} required minLength={8} />

        <Notice>
          Os alertas de resgate chegam pelo Telegram, que você ativa no próximo passo. Seu número fica oculto e só aparece para quem escanear a tag quando o pet estiver com status "Perdido".
        </Notice>

        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" block>Registrar no Ecossistema</Button>
      </form>
    </AuthLayout>
  );
}
