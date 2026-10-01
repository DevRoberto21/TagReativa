import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import PhotoPicker from '../components/PhotoPicker';
import Page from '../components/ui/Page';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';

export default function NewPet() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Cachorro');
  const [age, setAge] = useState('');
  const [breed, setBreed] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const upload = usePhotoUpload();
  const { photoUrl, uploadError } = upload;

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

      navigate('/dashboard');
    } catch {
      setError('Erro ao cadastrar pet. Tente novamente.');
    }
  }

  return (
    <Page>
      <PageHeader title="Vincular Nova Tag" onBack={() => navigate('/dashboard')} />

      <Panel>
        <PhotoPicker upload={upload} label="Carregar Imagem Digital" alt="Preview" />

        <form onSubmit={handleSubmit} className="stack">
          <Field label="Identificação / Nome" placeholder="Ex: Rex" value={name} onChange={e => setName(e.target.value)} required />

          <Field as="select" label="Espécie" value={species} onChange={e => setSpecies(e.target.value)}>
            <option>Cachorro</option>
            <option>Gato</option>
            <option>Outro</option>
          </Field>

          <Field label="Raça (opcional)" placeholder="Ex: Labrador" value={breed} onChange={e => setBreed(e.target.value)} />

          <Field label="Idade estimada (anos - opcional)" type="number" placeholder="Ex: 3" value={age} onChange={e => setAge(e.target.value)} min={1} max={50} />

          <Field
            as="textarea"
            label="Instruções médicas ou de cuidado (opcional)"
            placeholder="Ex: Necessita de medicação controlada, assusta-se com facilidade..."
            value={notes} onChange={e => setNotes(e.target.value)}
          />

          {(error || uploadError) && <Notice tone="error">{error || uploadError}</Notice>}
          <Button type="submit" block>Ativar Dispositivo e QR Code</Button>
        </form>
      </Panel>
    </Page>
  );
}
