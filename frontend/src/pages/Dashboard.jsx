import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useQrModal } from '../hooks/useQrModal';
import QrModal from '../components/QrModal';
import ConfirmModal from '../components/ConfirmModal';

function PetAvatar({ pet }) {
  if (pet.photoUrl) {
    return <img src={pet.photoUrl} alt={pet.name} style={styles.petPhoto} />;
  }
  const emoji = pet.species === 'Cachorro' ? '🐶' : pet.species === 'Gato' ? '🐱' : '🐾';
  return <div style={styles.petPhotoEmoji}>{emoji}</div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [pets, setPets] = useState([]);
  const [scanCounts, setScanCounts] = useState({});
  const [confirmModal, setConfirmModal] = useState(null);
  const { qrModal, openQr, downloadSvg, closeQr } = useQrModal();

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data)).catch(() => { });

    api.get('/pets').then(async r => {
      const petsData = r.data;
      setPets(petsData);

      const results = await Promise.all(
        petsData.map(pet =>
          api.get(`/pets/${pet.id}/scans`)
            .then(res => ({ id: pet.id, count: res.data.length }))
            .catch(() => ({ id: pet.id, count: 0 }))
        )
      );

      const counts = {};
      results.forEach(({ id, count }) => { counts[id] = count; });
      setScanCounts(counts);
    }).catch(() => { });
  }, []);

  function askToggle(pet) {
    const toStatus = pet.status === 'LOST' ? 'SEGURO' : 'PERDIDO';
    setConfirmModal({ pet, toStatus });
  }

  async function confirmToggle() {
    const { pet } = confirmModal;
    setConfirmModal(null);
    const newStatus = pet.status === 'LOST' ? 'SAFE' : 'LOST';
    try {
      const { data } = await api.patch(`/pets/${pet.id}/status`, { status: newStatus });
      setPets(prev => prev.map(p => p.id === pet.id ? { ...p, status: data.status } : p));
    } catch {
      alert('Erro ao atualizar status.');
    }
  }

  function logout() {
    localStorage.removeItem('access_token');
    navigate('/login');
  }

  return (
    <div style={styles.container}>
      <svg style={styles.bgSvg} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,200 C100,250 150,450 50,600 C-50,750 -200,700 -250,550 Z" fill="url(#leafGrad)" opacity="0.4" filter="blur(40px)" />
        <path d="M1500,100 C1350,150 1200,300 1300,500 C1400,700 1550,650 1600,500 Z" fill="url(#leafGrad)" opacity="0.35" filter="blur(50px)" />
        <g stroke="#94D2BD" strokeWidth="1" opacity="0.5" fill="none">
          <circle cx="200" cy="150" r="3" fill="#94D2BD" />
          <circle cx="280" cy="110" r="4" fill="#94D2BD" />
          <circle cx="350" cy="180" r="2" fill="#94D2BD" />
          <line x1="200" y1="150" x2="280" y2="110" />
          <line x1="280" y1="110" x2="350" y2="180" />
          <circle cx="1200" cy="400" r="3" fill="#94D2BD" />
          <circle cx="1280" cy="350" r="3" fill="#94D2BD" />
          <circle cx="1320" cy="450" r="4" fill="#94D2BD" />
          <line x1="1200" y1="400" x2="1280" y2="350" />
          <line x1="1280" y1="350" x2="1320" y2="450" />
        </g>
        <defs>
          <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#40916C" />
            <stop offset="100%" stopColor="#A9D6E5" />
          </linearGradient>
        </defs>
      </svg>

      <div style={styles.contentWrapper}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.logoContainer}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c0 2-.52 3.5-1.6 9.2A7 7 0 0 1 11 20z" />
                <path d="M19 2c-2.26 4.33-5.27 7.14-8 10" />
              </svg>
              <span style={styles.logoText}>TagReativa</span>
            </div>
            <span style={styles.divider}>/</span>
            <span style={styles.greeting}>Olá, {user?.name?.split(' ')[0] ?? '...'}</span>
          </div>
          <div style={styles.headerActions}>
            <Link to="/perfil" style={styles.headerLink}>Perfil</Link>
            <button onClick={logout} style={styles.logoutBtn}>Sair</button>
          </div>
        </header>

        <div style={styles.titleBlock}>
          <h1 style={styles.title}>Dispositivos Ativos</h1>
          <p style={styles.subtitle}>Gerenciamento de telemetria e segurança dos seus pets</p>
        </div>

        <div style={styles.list}>
          {pets.length === 0 && <p style={styles.empty}>Nenhum dispositivo TagReativa vinculado.</p>}
          {pets.map(pet => {
            const lost = pet.status === 'LOST';
            return (
              <div key={pet.id} style={{ ...styles.card, borderColor: lost ? '#FED7D7' : '#E1EBE5' }}>
                <div style={styles.cardTop}>
                  <PetAvatar pet={pet} />
                  <div style={styles.petInfo}>
                    <div style={styles.metaRow}>
                      <span style={styles.petName}>{pet.name}</span>
                      <span style={{ ...styles.statusDot, background: lost ? '#E63946' : '#40916C' }} />
                    </div>
                    <div style={styles.petSpecies}>{pet.species}</div>
                    <div style={styles.scanCount}>{scanCounts[pet.id] ?? '0'} leituras de sinal</div>
                  </div>
                </div>
                <div style={styles.cardBottom}>
                  <button
                    onClick={() => askToggle(pet)}
                    style={{ ...styles.toggle, background: lost ? '#E63946' : '#F4F7F6', color: lost ? '#FFF' : '#2D6A4F', border: lost ? 'none' : '1px solid #CBDCD0' }}
                  >
                    {lost ? 'STATUS: PERDIDO' : 'STATUS: SEGURO'}
                  </button>
                  <div style={styles.actionGroup}>
                    <button onClick={() => openQr(pet)} style={styles.qrBtn}>QR Code</button>
                    <Link to={`/pets/${pet.id}/editar`} style={styles.editBtn}>Editar</Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={() => navigate('/pets/novo')} style={styles.fab}>+ Vincular Nova Tag</button>
      </div>

      <ConfirmModal
        confirmModal={confirmModal}
        onConfirm={confirmToggle}
        onClose={() => setConfirmModal(null)}
      />

      <QrModal
        qrModal={qrModal}
        onDownload={downloadSvg}
        onClose={closeQr}
      />
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  bgSvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '32px 20px 120px', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' },
  headerLeft: { display: 'flex', alignItems: 'center' },
  logoContainer: { display: 'flex', alignItems: 'center', gap: '6px' },
  logoText: { fontWeight: 800, fontSize: '18px', color: '#1B4332', letterSpacing: '-0.5px' },
  divider: { margin: '0 12px', color: '#B3C6BF', fontSize: '14px' },
  greeting: { fontWeight: 500, fontSize: '14px', color: '#40665A' },
  headerActions: { display: 'flex', gap: '16px', alignItems: 'center' },
  headerLink: { fontSize: '14px', fontWeight: 600, color: '#40665A', textDecoration: 'none' },
  logoutBtn: { background: 'none', border: 'none', fontSize: '14px', fontWeight: 600, color: '#879671', cursor: 'pointer', padding: 0 },
  titleBlock: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 700, color: '#1B4332', letterSpacing: '-0.5px' },
  subtitle: { fontSize: '13px', color: '#40665A', marginTop: '4px' },
  list: { display: 'flex', flexDirection: 'column', gap: '16px' },
  empty: { color: '#40665A', textAlign: 'center', marginTop: '40px', fontSize: '14px' },
  card: { borderRadius: '16px', border: '1px solid', padding: '20px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(45, 106, 79, 0.03)' },
  cardTop: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' },
  petPhoto: { width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #E1EBE5', flexShrink: 0 },
  petPhotoEmoji: { fontSize: '28px', width: '56px', height: '56px', background: '#E6EFE9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  petInfo: { flex: 1 },
  metaRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  petName: { fontWeight: 700, fontSize: '16px', color: '#1B4332' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  petSpecies: { fontSize: '12px', color: '#40665A', marginTop: '2px' },
  scanCount: { fontSize: '12px', color: '#52796F', marginTop: '4px', fontWeight: 600 },
  cardBottom: { display: 'flex', flexDirection: 'column', gap: '12px' },
  toggle: { width: '100%', padding: '10px', borderRadius: '10px', border: 'none', fontWeight: 600, fontSize: '12px', cursor: 'pointer', letterSpacing: '0.5px' },
  actionGroup: { display: 'flex', gap: '8px', width: '100%' },
  qrBtn: { flex: 2, padding: '10px', borderRadius: '10px', border: '1px solid #CBDCD0', background: '#FFF', color: '#2D6A4F', fontWeight: 600, fontSize: '12px', cursor: 'pointer', textAlign: 'center' },
  editBtn: { flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #CBDCD0', background: '#F4F7F6', color: '#40665A', fontWeight: 600, fontSize: '12px', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' },
  fab: { position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', background: '#2D6A4F', color: '#FFF', border: 'none', borderRadius: '14px', padding: '14px 28px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', boxShadow: '0 8px 24px rgba(45, 106, 79, 0.2)', whiteSpace: 'nowrap', zIndex: 10 },
};