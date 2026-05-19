import { useParams } from 'react-router-dom';
import { useScan } from '../hooks/useScan';

export default function ScanPage() {
  const { petId } = useParams();
  const { result, error, loading } = useScan(petId);

  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner}></div>
        <p style={styles.muted}>Rastreando conexões e registrando scan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered}>
        <div style={styles.errorCard}>
          <p style={{ color: '#E63946', fontWeight: 'bold', margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const { pet, owner } = result;
  const isLost = pet?.status === 'LOST';
  const hasPhoto = !!pet?.photoUrl;

  const rawWhatsapp = owner?.whatsapp ? owner.whatsapp.replace(/\D/g, '') : '';
  const whatsappNumber = rawWhatsapp.startsWith('55') ? rawWhatsapp : `55${rawWhatsapp}`;
  const whatsappHref = `https://wa.me/${whatsappNumber}`;

  return (
    <div style={styles.page}>
      <svg style={styles.bgSvg} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,200 C100,250 150,450 50,600 C-50,750 -200,700 -250,550 Z" fill="url(#leafGrad)" opacity="0.4" filter="blur(40px)" />
        <path d="M1500,100 C1350,150 1200,300 1300,500 C1400,700 1550,650 1600,500 Z" fill="url(#leafGrad)" opacity="0.35" filter="blur(50px)" />
        <g stroke="#94D2BD" strokeWidth="1" opacity="0.5" fill="none">
          <circle cx="200" cy="150" r="3" fill="#94D2BD" />
          <circle cx="280" cy="110" r="4" fill="#94D2BD" />
          <line x1="200" y1="150" x2="280" y2="110" />
        </g>
        <defs>
          <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#40916C" />
            <stop offset="100%" stopColor="#A9D6E5" />
          </linearGradient>
        </defs>
      </svg>

      <div style={styles.contentWrapper}>
        <div style={styles.card}>
          <div style={styles.avatarContainer}>
            {hasPhoto ? (
              <img src={pet.photoUrl} alt={pet.name} style={styles.petPhoto} />
            ) : (
              <div style={styles.emojiPlaceholder}>
                {pet?.species === 'Cachorro' ? '🐶' : pet?.species === 'Gato' ? '🐱' : '🐾'}
              </div>
            )}
            <span style={{ ...styles.pulseBadge, background: isLost ? '#E63946' : '#40916C' }}></span>
          </div>

          <h1 style={styles.name}>{pet?.name}</h1>
          <p style={styles.species}>{pet?.species}</p>

          {pet?.notes && pet.notes.trim() !== '' ? (
            <div style={styles.notesBox}>
              <span style={styles.boxLabel}>Observações do Tutor</span>
              <p style={styles.notesText}>{pet.notes}</p>
            </div>
          ) : (
            <div style={styles.notesBox}>
              <span style={styles.boxLabel}>Observações do Tutor</span>
              <p style={{ ...styles.notesText, color: '#A3B18A', fontStyle: 'italic' }}>
                Nenhuma instrução de cuidado específica foi registrada.
              </p>
            </div>
          )}

          {isLost ? (
            <div style={styles.lostBox}>
              <p style={styles.lostTitle}>⚠️ Sistema de Resgate Ativo</p>
              <p style={styles.lostSub}>Este animal foi reportado como perdido. Utilize o canal abaixo para alertar o tutor:</p>
              {rawWhatsapp ? (
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" style={styles.waButton}>
                  Contatar Tutor via WhatsApp
                </a>
              ) : (
                <p style={styles.noContactText}>Contato indisponível no momento.</p>
              )}
            </div>
          ) : (
            <div style={styles.safeBox}>
              <p style={styles.safeText}>🛡️ Dispositivo em Zona Segura</p>
              <p style={styles.safeSub}>O tutor não reportou nenhuma ocorrência ativa para este dispositivo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  bgSvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '24px 16px', width: '100%', display: 'flex', justifyContent: 'center' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.05)', border: '1px solid rgba(255, 255, 255, 0.6)', textAlign: 'center' },
  centered: { minHeight: '100vh', background: '#F4F7F6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  spinner: { width: 28, height: 28, border: '3px solid #D8EADF', borderTop: '3px solid #2D6A4F', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  errorCard: { background: '#FFF5F5', border: '1px solid #FED7D7', borderRadius: '16px', padding: '16px 24px' },
  muted: { color: '#52796F', fontSize: 14 },
  avatarContainer: { position: 'relative', width: 104, height: 104, margin: '0 auto 16px' },
  petPhoto: { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid #FFF', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  emojiPlaceholder: { width: '100%', height: '100%', borderRadius: '50%', background: '#E6EFE9', fontSize: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pulseBadge: { position: 'absolute', bottom: 4, right: 4, width: 14, height: 14, borderRadius: '50%', border: '2.5px solid #FFF' },
  name: { fontSize: 26, fontWeight: 700, margin: '0 0 4px', color: '#1B4332', letterSpacing: '-0.5px' },
  species: { fontSize: 13, color: '#52796F', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 24 },
  notesBox: { background: 'rgba(255, 255, 255, 0.6)', border: '1px solid #CBDCD0', borderRadius: '16px', padding: 16, marginBottom: 20, textAlign: 'left' },
  boxLabel: { fontSize: 11, fontWeight: 700, color: '#2D6A4F', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 },
  notesText: { color: '#1B4332', fontSize: 14, margin: 0, lineHeight: 1.5, fontWeight: 500 },
  lostBox: { background: '#FFF5F5', border: '1px solid #FED7D7', borderRadius: '16px', padding: 20 },
  lostTitle: { color: '#E63946', fontWeight: 700, margin: '0 0 6px', fontSize: 15 },
  lostSub: { color: '#52796F', fontSize: 13, margin: '0 0 16px', lineHeight: 1.4 },
  waButton: { display: 'block', background: '#2D6A4F', color: '#FFF', borderRadius: '12px', padding: '14px', textDecoration: 'none', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)' },
  noContactText: { color: '#E63946', fontSize: 13, margin: 0, fontWeight: 500 },
  safeBox: { background: '#EAF7F0', border: '1px solid #C6EDD4', borderRadius: '16px', padding: 18 },
  safeText: { color: '#2D6A4F', fontWeight: 700, fontSize: 15, margin: '0 0 4px' },
  safeSub: { color: '#52796F', fontSize: 13, margin: 0 },
};