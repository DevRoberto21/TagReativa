import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import api from '../services/api';
import getCroppedImg from '../utils/cropImage';

const CLOUD_NAME = 'dan2bsmlk';
const UPLOAD_PRESET = 'tagreativa_pictures';

export default function NewPet() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Cachorro');
  const [age, setAge] = useState('');
  const [breed, setBreed] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [physicalFallbackConsent, setPhysicalFallbackConsent] = useState(false);

  const [rawImage, setRawImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [showCropper, setShowCropper] = useState(false);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  }

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleCropConfirm() {
    setUploading(true);
    try {
      const blob = await getCroppedImg(rawImage, croppedAreaPixels);
      const formData = new FormData();
      formData.append('file', blob, 'photo.jpg');
      formData.append('upload_preset', UPLOAD_PRESET);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      setPhotoUrl(data.secure_url);
      setShowCropper(false);
    } catch {
      setError('Erro ao fazer upload da foto.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { name, species, physicalFallbackConsent };
      if (age !== '') payload.age = parseInt(age);
      if (breed.trim()) payload.breed = breed.trim();
      if (photoUrl) payload.photoUrl = photoUrl;
      const { data } = await api.post('/pets', payload);
      if (data.qrCodeBase64) {
        localStorage.setItem(`qr_${data.id}`, data.qrCodeBase64);
      }
      navigate('/dashboard');
    } catch {
      setError('Erro ao cadastrar pet. Tente novamente.');
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => navigate('/dashboard')} style={styles.back}>← Voltar</button>
        <h1 style={styles.title}>Cadastrar Pet</h1>
      </header>

      {showCropper && (
        <div style={styles.cropOverlay}>
          <div style={styles.cropBox}>
            <div style={styles.cropArea}>
              <Cropper
                image={rawImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <input
              type="range" min={1} max={3} step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={styles.slider}
            />
            <div style={styles.cropButtons}>
              <button onClick={() => setShowCropper(false)} style={styles.cancelButton}>Cancelar</button>
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
            {photoUrl
              ? <img src={photoUrl} alt="Foto do pet" style={styles.avatar} />
              : <div style={styles.avatarPlaceholder}>🐾</div>
            }
          </div>
          <label style={styles.photoButton}>
            Adicionar foto
            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Nome do Pet</label>
          <input style={styles.input} placeholder="Ex: Rex" value={name} onChange={e => setName(e.target.value)} required />

          <label style={styles.label}>Espécie</label>
          <select style={styles.input} value={species} onChange={e => setSpecies(e.target.value)}>
            <option>Cachorro</option>
            <option>Gato</option>
            <option>Outro</option>
          </select>

          <label style={styles.label}>Raça — opcional</label>
          <input style={styles.input} placeholder="Ex: Labrador" value={breed} onChange={e => setBreed(e.target.value)} />

          <label style={styles.label}>Idade (anos) — opcional</label>
          <input style={styles.input} type="number" placeholder="Ex: 3" value={age} onChange={e => setAge(e.target.value)} min={1} max={50} />

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={physicalFallbackConsent}
              onChange={e => setPhysicalFallbackConsent(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Meu pet possui uma plaquinha física com meus dados de contato
          </label>

          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">Salvar e Gerar Tag</button>
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
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: '13px', color: '#374151', cursor: 'pointer' },
  error: { color: '#DC2626', fontSize: '13px' },
  photoSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '20px' },
  avatarWrapper: { width: '96px', height: '96px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #D1D5DB', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: { fontSize: '36px' },
  photoButton: { fontSize: '13px', color: '#2563EB', fontWeight: 'bold', cursor: 'pointer' },
  cropOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cropBox: { width: '320px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
  cropArea: { position: 'relative', width: '300px', height: '300px', borderRadius: '50%', overflow: 'hidden' },
  slider: { width: '100%' },
  cropButtons: { display: 'flex', gap: '12px', width: '100%' },
  cancelButton: { flex: 1, padding: '12px', borderRadius: '8px', background: 'transparent', color: '#fff', fontWeight: 'bold', fontSize: '15px', border: '1px solid #fff', cursor: 'pointer' },
};