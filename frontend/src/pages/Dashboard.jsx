import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

function PetAvatar({ pet }) {
  if (pet.photoUrl) {
    return <img src={pet.photoUrl} alt={pet.name} style={styles.petPhoto} />;
  }
  const emoji = pet.species === 'cachorro' ? '🐶' : pet.species === 'gato' ? '🐱' : '🐾';
  return <div style={styles.petPhotoEmoji}>{emoji}</div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [pets, setPets] = useState([]);
  const [qrModal, setQrModal] = useState(null);

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data)).catch(() => {});
    api.get('/pets').then(r => setPets(r.data)).catch(() => {});
  }, []);

  async function toggleStatus(pet) {
    const newStatus = pet.status === 'LOST' ? 'SAFE' : 'LOST';
    try {
      const { data } = await api.patch(`/pets/${pet.id}/status`, { status: newStatus });
      setPets(prev => prev.map(p => p.id === pet.id ? { ...p, status: data.status } : p));
    } catch {
      alert('Erro ao atualizar status.');
    }
  }

  function openQr(pet) {
    const stored = localStorage.getItem(`qr_${pet.id}`);
    if (stored) setQrModal({ name: pet.name, qr: stored });
    else alert('QR Code não disponível. Recadastre o pet para gerar.');
  }

  function logout() {
    localStorage.removeItem('access_token');
    navigate('/login');
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.avatar}>🐾</span>
          <span style={styles.greeting}>Olá, {user?.name?.split(' ')[0] ?? '...'}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link to="/perfil" style={styles.gear} title="Perfil">⚙️</Link>
          <button onClick={logout} style={styles.logoutBtn} title="Sair">🚪</button>
        </div>
      </header>

      <div style={styles.titleBlock}>
        <h1 style={styles.title}>Meus Pets</h1>
        <p style={styles.subtitle}>Gerencie o status de segurança dos seus animais</p>
      </div>

      <div style={styles.list}>
        {pets.length === 0 && <p style={styles.empty}>Nenhum pet cadastrado ainda.</p>}
        {pets.map(pet => {
          const lost = pet.status === 'LOST';
          return (
            <div key={pet.id} style={{ ...styles.card, borderColor: lost ? '#FECACA' : '#BBF7D0', background: lost ? '#FFF1F2' : '#F0FDF4' }}>
              <div style={styles.cardTop}>
                <PetAvatar pet={pet} />
                <div style={styles.petInfo}>
                  <div style={styles.petName}>{pet.name}</div>
                  <div style={styles.petSpecies}>{pet.species}</div>
                </div>
                <Link to={`/pets/${pet.id}/editar`} style={styles.editIcon} title="Editar">✏️</Link>
              </div>
              <div style={styles.cardBottom}>
                <button
                  onClick={() => toggleStatus(pet)}
                  style={{ ...styles.toggle, background: lost ? '#DC2626' : '#16A34A', color: '#fff' }}
                >
                  {lost ? '🔴 PERDIDO' : '🟢 SEGURO'}
                </button>
                <button onClick={() => openQr(pet)} style={styles.qrBtn}>Ver QR Code</button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => navigate('/pets/novo')} style={styles.fab}>+ Adicionar Novo Pet</button>

      {qrModal && (
        <div style={styles.overlay} onClick={() => setQrModal(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>QR Code — {qrModal.name}</h2>
            <img src={qrModal.qr} alt="QR Code" style={styles.qrImg} />
            <button onClick={() => setQrModal(null)} style={styles.closeBtn}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', padding: '24px 16px 100px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { fontSize: '28px' },
  greeting: { fontWeight: 'bold', fontSize: '16px', color: '#1F2937' },
  gear: { fontSize: '22px', textDecoration: 'none' },
  logoutBtn: { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer' },
  titleBlock: { marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 'bold', color: '#1F2937' },
  subtitle: { fontSize: '13px', color: '#6B7280', marginTop: '4px' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: '40px' },
  card: { borderRadius: '12px', border: '1.5px solid', padding: '16px', background: '#fff' },
  cardTop: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  petPhoto: { width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #D1D5DB', flexShrink: 0 },
  petPhotoEmoji: { fontSize: '36px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  petInfo: { flex: 1 },
  petName: { fontWeight: 'bold', fontSize: '16px', color: '#1F2937' },
  petSpecies: { fontSize: '13px', color: '#6B7280' },
  editIcon: { fontSize: '18px', textDecoration: 'none' },
  cardBottom: { display: 'flex', gap: '10px' },
  toggle: { flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' },
  qrBtn: { flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #2563EB', background: '#fff', color: '#2563EB', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' },
  fab: { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#2563EB', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 28px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: '12px', padding: '32px', textAlign: 'center', maxWidth: '320px', width: '90%' },
  modalTitle: { fontSize: '18px', fontWeight: 'bold', marginBottom: '20px', color: '#1F2937' },
  qrImg: { width: '200px', height: '200px', marginBottom: '20px' },
  closeBtn: { padding: '10px 24px', borderRadius: '8px', background: '#2563EB', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' },
};