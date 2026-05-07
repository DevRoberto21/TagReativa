import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

export default function EditPet() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Cachorro');
  const [age, setAge] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/pets/${id}`)
      .then(r => {
        setName(r.data.name);
        setSpecies(r.data.species);
        setAge(r.data.age ?? '');
      })
      .catch(() => setError('Erro ao carregar dados do pet.'));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { name, species };
      if (age !== '') payload.age = parseInt(age);
      await api.patch(`/pets/${id}`, payload);
      navigate('/dashboard');
    } catch {
      setError('Erro ao salvar alterações.');
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => navigate('/dashboard')} style={styles.back}>← Voltar</button>
        <h1 style={styles.title}>Editar Pet</h1>
      </header>

      <div style={styles.card}>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Nome do Pet</label>
          <input style={styles.input} value={name} onChange={e => setName(e.target.value)} required />

          <label style={styles.label}>Espécie</label>
          <select style={styles.input} value={species} onChange={e => setSpecies(e.target.value)}>
            <option>Cachorro</option>
            <option>Gato</option>
            <option>Outro</option>
          </select>

          <label style={styles.label}>Idade (anos) — opcional</label>
          <input style={styles.input} type="number" placeholder="Ex: 3" value={age} onChange={e => setAge(e.target.value)} min={0} max={50} />

          {error && <p style={styles.error}>{error}</p>}
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
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '13px', fontWeight: 'bold', color: '#374151' },
  input: { padding: '12px 14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' },
  button: { padding: '12px', borderRadius: '8px', background: '#2563EB', color: '#fff', fontWeight: 'bold', fontSize: '15px', border: 'none', cursor: 'pointer', marginTop: '8px' },
  error: { color: '#DC2626', fontSize: '13px' },
};