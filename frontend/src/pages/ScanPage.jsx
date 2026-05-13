import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const SPECIES_EMOJI = {
  cachorro: '🐶',
  gato: '🐱',
  outro: '🐾',
};

export default function ScanPage() {
  const { petId } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function doScan(latitude, longitude) {
      axios
        .post(`http://localhost:3000/scan/${petId}`, {
          latitude,
          longitude,
          consentGranted: true,
          consentVersion: '1.0',
        })
        .then((res) => setResult(res.data))
        .catch(() => setError('Pet não encontrado ou erro no servidor.'))
        .finally(() => setLoading(false));
    }

    if (!navigator.geolocation) {
      doScan();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => doScan(pos.coords.latitude, pos.coords.longitude),
      () => doScan(),
      { timeout: 5000 },
    );
  }, [petId]);

  if (loading) {
    return (
      <div style={styles.centered}>
        <p style={styles.muted}>Registrando scan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered}>
        <p style={{ color: '#DC2626' }}>{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const { pet, owner } = result;
  const isLost = pet.status === 'LOST';
  const emoji = SPECIES_EMOJI[pet.species] || '🐾';
  const whatsappNumber = owner.whatsapp ? owner.whatsapp.replace(/\D/g, '') : '';
  const whatsappHref = `https://wa.me/55${whatsappNumber}`;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.emoji}>{emoji}</div>
        <h1 style={styles.name}>{pet.name}</h1>
        <p style={styles.species}>{pet.species}</p>

        {isLost ? (
          <div style={styles.lostBox}>
            <p style={styles.lostTitle}>⚠️ Este pet está perdido</p>
            <p style={styles.lostSub}>Entre em contato com o tutor:</p>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.waButton}
            >
              WhatsApp: {owner.whatsapp}
            </a>
          </div>
        ) : (
          <div style={styles.safeBox}>
            <p style={styles.safeText}>✅ Este pet está seguro</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#E8EEFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    maxWidth: 400,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  centered: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 64, marginBottom: 8 },
  name: { fontSize: 28, fontWeight: 700, margin: '0 0 4px', color: '#1e293b' },
  species: { fontSize: 14, color: '#64748b', marginBottom: 24, textTransform: 'capitalize' },
  muted: { color: '#64748b' },
  lostBox: {
    background: '#FFF1F2',
    border: '1px solid #FECACA',
    borderRadius: 8,
    padding: 16,
  },
  lostTitle: { color: '#DC2626', fontWeight: 700, marginBottom: 8 },
  lostSub: { color: '#64748b', fontSize: 13, marginBottom: 12 },
  waButton: {
    display: 'inline-block',
    background: '#16A34A',
    color: '#fff',
    borderRadius: 8,
    padding: '10px 20px',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 15,
  },
  safeBox: {
    background: '#F0FDF4',
    border: '1px solid #BBF7D0',
    borderRadius: 8,
    padding: 16,
  },
  safeText: { color: '#16A34A', fontWeight: 700 },
};