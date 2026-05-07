import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

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
      await api.post('/users/register', {
        name: form.name,
        email: form.email,
        whatsapp: form.whatsapp,
        password: form.password,
        age,
      });
      navigate('/login');
    } catch {
      setError('Erro ao criar conta. Verifique os dados.');
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🛡️</span>
          <div>
            <div style={styles.logoTitle}>Pet Rescue</div>
            <div style={styles.logoSub}>Sistema de Identificação e Resgate</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} name="name" placeholder="Nome Completo" value={form.name} onChange={handleChange} required />
          <input style={styles.input} name="email" type="email" placeholder="E-mail" value={form.email} onChange={handleChange} required />
          <input style={styles.input} name="whatsapp" placeholder="WhatsApp (DD9XXXX-XXXX)" value={form.whatsapp} onChange={handleChange} required />
          <input style={styles.input} name="age" type="number" placeholder="Idade (mínimo 18)" value={form.age} onChange={handleChange} min={18} required />
          <input style={styles.input} name="password" type="password" placeholder="Senha" value={form.password} onChange={handleChange} required />
          <input style={styles.input} name="confirm" type="password" placeholder="Confirmar Senha" value={form.confirm} onChange={handleChange} required />

          <div style={styles.notice}>
            💬 O WhatsApp é o canal principal de resgate. Este número será exibido apenas quando você marcar seu pet como PERDIDO.
          </div>

          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">Criar Conta</button>
        </form>

        <Link to="/login" style={styles.link}>Já tem uma conta? Entrar</Link>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  card: { background: '#fff', borderRadius: '12px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', justifyContent: 'center' },
  logoIcon: { fontSize: '36px' },
  logoTitle: { fontSize: '22px', fontWeight: 'bold', color: '#2563EB' },
  logoSub: { fontSize: '12px', color: '#6B7280' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { padding: '12px 14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' },
  notice: { background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#1D4ED8' },
  button: { padding: '12px', borderRadius: '8px', background: '#2563EB', color: '#fff', fontWeight: 'bold', fontSize: '15px', border: 'none', cursor: 'pointer', marginTop: '4px' },
  error: { color: '#DC2626', fontSize: '13px' },
  link: { display: 'block', textAlign: 'center', marginTop: '20px', color: '#2563EB', fontSize: '14px' },
};