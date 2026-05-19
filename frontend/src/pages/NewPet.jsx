import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import api from '../services/api';
import { usePhotoUpload } from '../hooks/usePhotoUpload';

export default function NewPet() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Cachorro');
  const [age, setAge] = useState('');
  const [breed, setBreed] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isFirstPet, setIsFirstPet] = useState(false);

  const {
    photoUrl,
    showCropper,
    uploading,
    uploadError,
    rawImage,
    crop,
    setCrop,
    zoom,
    setZoom,
    handleFileChange,
    onCropComplete,
    handleCropConfirm,
    cancelCrop,
  } = usePhotoUpload();

  useEffect(() => {
    api.get('/pets').then(r => setIsFirstPet(r.data.length === 0)).catch(() => { });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { name, species };
      if (age !== '') payload.age = parseInt(age);
      if (breed.trim()) payload.breed = breed.trim();
      if (photoUrl) payload.photoUrl = photoUrl;
      if (notes.trim()) payload.notes = notes.trim();

      await api.post('/pets', payload);

      if (isFirstPet) {
        const { data: user } = await api.get('/users/me');
        if (!user.callMeBotApiKey) {
          navigate('/configurar-notificacao', { state: { fromNewPet: true } });
          return;
        }
      }

      navigate('/dashboard');
    } catch {
      setError('Erro ao cadastrar pet. Tente novamente.');
    }
  }

  return (
    <div style={styles.container}>
      <svg style={styles.bgSvg} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,200 C100,250 150,450 50,600 C-50,750 -200,700 -250,550 Z" fill="url(#leafGrad)" opacity="0.4" filter="blur(40px)" />
        <path d="M1500,100 C1350,150 1200,300 1300,500 C1400,700 1550,650 1600,500 Z" fill="url(#leafGrad)" opacity="0.35" filter="blur(50px)" />
        <g stroke="#94D2BD" strokeWidth="1" opacity="0.5" fill="none">
          <line x1="200" y1="150" x2="280" y2="110" /><line x1="1200" y1="400" x2="1280" y2="350" />
        </g>
        <defs>
          <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#40916C" /><stop offset="100%" stopColor="#A9D6E5" />
          </linearGradient>
        </defs>
      </svg>

      <div style={styles.contentWrapper}>
        <header style={styles.header}>
          <button onClick={() => navigate('/dashboard')} style={styles.back}>Voltar</button>
          <h1 style={styles.title}>Vincular Nova Tag</h1>
        </header>

        {showCropper && (
          <div style={styles.cropOverlay}>
            <div style={styles.cropBox}>
              <div style={styles.cropArea}>
                <Cropper
                  image={rawImage} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
                  onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
                />
              </div>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={styles.slider} />
              <div style={styles.cropButtons}>
                <button onClick={cancelCrop} style={styles.cancelButton}>Cancelar</button>
                <button onClick={handleCropConfirm} disabled={uploading} style={styles.button}>
                  {uploading ? 'Enviando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={styles.card}>
          <div style={styles.photoSection}>
            <div style={styles.avatarWrapper}>
              {photoUrl ? <img src={photoUrl} alt="Preview" style={styles.avatar} /> : <div style={styles.avatarPlaceholder}>🐾</div>}
            </div>
            <label style={styles.photoButton}>
              Carregar Imagem Digital
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>Identificação / Nome</label>
            <input style={styles.input} placeholder="Ex: Rex" value={name} onChange={e => setName(e.target.value)} required />

            <label style={styles.label}>Espécie</label>
            <select style={styles.select} value={species} onChange={e => setSpecies(e.target.value)}>
              <option>Cachorro</option>
              <option>Gato</option>
              <option>Outro</option>
            </select>

            <label style={styles.label}>Raça (opcional)</label>
            <input style={styles.input} placeholder="Ex: Labrador" value={breed} onChange={e => setBreed(e.target.value)} />

            <label style={styles.label}>Idade estimada (anos - opcional)</label>
            <input style={styles.input} type="number" placeholder="Ex: 3" value={age} onChange={e => setAge(e.target.value)} min={1} max={50} />

            <label style={styles.label}>Instruções médicas ou de cuidado (opcional)</label>
            <textarea
              style={styles.textarea} placeholder="Ex: Necessita de medicação controlada, assusta-se com facilidade..."
              value={notes} onChange={e => setNotes(e.target.value)}
            />

            {(error || uploadError) && <p style={styles.error}>{error || uploadError}</p>}
            <button style={styles.button} type="submit">Ativar Dispositivo e QR Code</button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  bgSvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
  contentWrapper: { position: 'relative', zIndex: 2, padding: '32px 16px', width: '100%', maxWidth: '480px', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' },
  back: { background: 'none', border: 'none', fontSize: '14px', color: '#40665A', cursor: 'pointer', fontWeight: 600, padding: 0 },
  title: { fontSize: '20px', fontWeight: 700, color: '#1B4332', margin: 0, letterSpacing: '-0.5px' },
  card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '32px 24px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.04)', border: '1px solid rgba(255, 255, 255, 0.6)' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  label: { fontSize: '12px', fontWeight: 700, color: '#2D6A4F', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { padding: '13px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box', width: '100%' },
  select: { padding: '13px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box', width: '100%', appearance: 'none' },
  textarea: { padding: '13px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box', width: '100%', minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' },
  button: { padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)' },
  error: { color: '#E63946', fontSize: '13px', textAlign: 'center', fontWeight: 500, margin: 0 },
  photoSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '24px' },
  avatarWrapper: { width: '88px', height: '88px', borderRadius: '50%', overflow: 'hidden', border: '1px solid #CBDCD0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: { fontSize: '28px' },
  photoButton: { fontSize: '13px', color: '#2D6A4F', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' },
  cropOverlay: { position: 'fixed', inset: 0, background: 'rgba(27, 67, 50, 0.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cropBox: { width: '320px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
  cropArea: { position: 'relative', width: '280px', height: '280px', borderRadius: '24px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' },
  slider: { width: '100%', accentColor: '#2D6A4F' },
  cropButtons: { display: 'flex', gap: '10px', width: '100%' },
  cancelButton: { flex: 1, padding: '12px', borderRadius: '12px', background: 'transparent', color: '#FFF', fontWeight: 600, fontSize: '14px', border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer' },
};