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

  useEffect(() => {
    api.get('/users/me')
      .then(r => {
        setName(r.data.name);
        setWhatsapp(r.data.whatsapp);
        setAge(r.data.age ?? '');
      })
      .catch(() => setError('Erro ao carregar perfil.'));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    const parsedAge = parseInt(age);
    if (age !== '' && parsedAge < 18) {
      setError('Idade mínima é 18 anos.');
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

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => navigate('/dashboard')} style={styles.back}>← Voltar</button>
        <h1 style={styles.title}>Meu Perfil</h1>
      </header>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Dados do Tutor</h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Nome Completo</label>
          <input style={styles.input} value={name} onChange={e => setName(e.target.value)} required />

          <label style={styles.label}>WhatsApp/Telefone</label>
          <input style={styles.input} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required />

          <label style={styles.label}>Idade</label>
          <input style={styles.input} type="number" value={age} onChange={e => setAge(e.target.value)} min={18} placeholder="Mínimo 18 anos" />

          <div style={styles.notice}>
            💬 Este número será exibido apenas quando você marcar seu pet como PERDIDO.
          </div>

          {error && <p style={styles.error}>{error}</p>}
          {success && <p style={styles.success}>Alterações salvas com sucesso.</p>}

          <button style={styles.button} type="submit">Salvar Alterações</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', padding: '24px 16px' },
  header: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' },
  back: { background: 'none', border: 'none', fontSize: '15px', color: '#2563EB', cursor: 'pointer', fontWeight: 'bold' },
  title: { fontSize: '20px', fontWeight: 'bold', color: '#1F2937' },
  card: { background: '#fff', borderRadius: '12px', padding: '24px' },
  cardTitle: { fontSize: '16px', fontWeight: 'bold', color: '#1F2937', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '13px', fontWeight: 'bold', color: '#374151' },
  input: { padding: '12px 14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' },
  notice: { background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#1D4ED8' },
  button: { padding: '12px', borderRadius: '8px', background: '#2563EB', color: '#fff', fontWeight: 'bold', fontSize: '15px', border: 'none', cursor: 'pointer', marginTop: '8px' },
  error: { color: '#DC2626', fontSize: '13px' },
  success: { color: '#16A34A', fontSize: '13px' },
};