import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import PhotoPicker from '../components/PhotoPicker';
import ConfirmModal from '../components/ConfirmModal';
import Page from '../components/ui/Page';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';

export default function EditPet() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Cachorro');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const upload = usePhotoUpload();
  const { photoUrl, setPhotoUrl, uploadError } = upload;

  useEffect(() => {
    api.get(`/pets/${id}`)
      .then(r => {
        setName(r.data.name);
        setSpecies(r.data.species);
        setBreed(r.data.breed ?? '');
        setAge(r.data.age ?? '');
        setPhotoUrl(r.data.photoUrl ?? '');
        setNotes(r.data.notes ?? '');
      })
      .catch(() => setError('Erro ao carregar dados do dispositivo.'));
  }, [id, setPhotoUrl]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = { name, species };
      if (breed.trim()) payload.breed = breed.trim();
      if (age !== '') payload.age = parseInt(age);
      if (photoUrl) payload.photoUrl = photoUrl;
      payload.notes = notes.trim() || null;
      await api.patch(`/pets/${id}`, payload);
      navigate('/dashboard');
    } catch {
      setError('Erro ao salvar alterações.');
    }
  }

  async function handleDelete() {
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      await api.delete(`/pets/${id}`);
      localStorage.removeItem(`qr_${id}`);
      navigate('/dashboard');
    } catch {
      setError('Erro ao remover dispositivo.');
      setDeleting(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Configurações da Tag" onBack={() => navigate('/dashboard')} />

      <Panel>
        <PhotoPicker upload={upload} label="Alterar Registro Fotográfico" />

        <form onSubmit={handleSubmit} className="stack">
          <Field label="Nome Cadastrado" value={name} onChange={e => setName(e.target.value)} required />

          <Field as="select" label="Espécie" value={species} onChange={e => setSpecies(e.target.value)}>
            <option>Cachorro</option><option>Gato</option><option>Outro</option>
          </Field>

          <Field label="Raça" value={breed} onChange={e => setBreed(e.target.value)} />

          <Field label="Idade (anos)" type="number" value={age} onChange={e => setAge(e.target.value)} min={1} max={50} />

          <Field as="textarea" label="Observações de Resgate / Cuidados" value={notes} onChange={e => setNotes(e.target.value)} />

          {(error || uploadError) && <Notice tone="error">{error || uploadError}</Notice>}
          <Button type="submit" block>Salvar Atualizações</Button>
        </form>
      </Panel>

      <Panel tone="alert">
        <Button variant="danger" block onClick={() => setConfirmingDelete(true)} disabled={deleting}>
          {deleting ? 'Removendo do banco...' : 'Excluir e Desvincular Dispositivo'}
        </Button>
      </Panel>

      <ConfirmModal
        confirmModal={confirmingDelete || null}
        onConfirm={handleDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Excluir e Desvincular Dispositivo"
        confirmLabel="Confirmar Exclusão"
        tone="danger"
      >
        Desvincular e remover esta Tag permanentemente?
      </ConfirmModal>
    </Page>
  );
}
