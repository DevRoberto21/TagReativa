import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import api from '../services/api';
import { useQrModal } from '../hooks/useQrModal';
import QrModal from '../components/QrModal';
import ConfirmModal from '../components/ConfirmModal';
import Page from '../components/ui/Page';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import Icon from '../components/ui/Icon';
import PetAvatar from '../components/ui/PetAvatar';
import StatusBadge from '../components/ui/StatusBadge';
import Counter from '../components/ui/Counter';
import { rise, reveal } from '../components/ui/motionPresets';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [pets, setPets] = useState([]);
  const [scanCounts, setScanCounts] = useState({});
  const [confirmModal, setConfirmModal] = useState(null);
  const [statusError, setStatusError] = useState('');
  const { qrModal, openQr, downloadSvg, downloadPng, closeQr } = useQrModal();

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
    setStatusError('');
    const newStatus = pet.status === 'LOST' ? 'SAFE' : 'LOST';
    try {
      const { data } = await api.patch(`/pets/${pet.id}/status`, { status: newStatus });
      setPets(prev => prev.map(p => p.id === pet.id ? { ...p, status: data.status } : p));
    } catch {
      setStatusError('Erro ao atualizar status.');
    }
  }

  function logout() {
    localStorage.removeItem('access_token');
    navigate('/login');
  }

  return (
    <Page width="wide" className={styles.page}>
      <motion.header className={styles.topbar} variants={rise}>
        <div className={styles.brand}>
          <Icon name="logo" size={24} />
          <span className={styles.wordmark}>TagReativa</span>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" to="/perfil">Perfil</Button>
          <Button variant="ghost" size="sm" onClick={logout}>Sair</Button>
        </div>
      </motion.header>

      <motion.div className={styles.heading} variants={rise}>
        <p className={styles.eyebrow}>Olá, {user?.name?.split(' ')[0] ?? '...'}</p>
        <h1 className={styles.title}>Dispositivos Ativos</h1>
        <p className={styles.subtitle}>Gerenciamento de telemetria e segurança dos seus pets</p>
      </motion.div>

      <AnimatePresence>
        {statusError && (
          <motion.div {...reveal}>
            <Notice tone="error">{statusError}</Notice>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.list}>
        {pets.length === 0 && (
          <Panel className={styles.empty}>
            <Icon name="signal" size={32} />
            <p>Nenhum dispositivo TagReativa vinculado.</p>
          </Panel>
        )}
        {pets.map((pet, index) => {
          const lost = pet.status === 'LOST';
          return (
            <Panel key={pet.id} layout custom={index} tone={lost ? 'alert' : 'default'} brackets={false} className={styles.card}>
              <div className={styles.cardTop}>
                <PetAvatar pet={pet} lost={lost} ping={lost} />
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{pet.name}</span>
                    <StatusBadge lost={lost} />
                  </div>
                  <div className={styles.meta}>
                    <span>{pet.species}</span>
                    <span className={styles.scans}>
                      <Icon name="signal" size={14} />
                      <span><strong><Counter value={scanCounts[pet.id] ?? 0} /></strong> leituras de sinal</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.cardBottom}>
                <Button
                  variant={lost ? 'alert' : 'secondary'}
                  block
                  className={styles.toggle}
                  onClick={() => askToggle(pet)}
                >
                  {lost ? 'STATUS: PERDIDO' : 'STATUS: SEGURO'}
                </Button>
                <div className={styles.actionGroup}>
                  <Button variant="secondary" size="sm" icon="qr" onClick={() => openQr(pet)}>QR Code</Button>
                  <Button variant="ghost" size="sm" to={`/pets/${pet.id}/editar`}>Editar</Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className={styles.bar}>
        <div className={styles.barInner}>
          <Button block icon="plus" onClick={() => navigate('/pets/novo')}>Vincular Nova Tag</Button>
        </div>
      </div>

      <ConfirmModal
        confirmModal={confirmModal}
        onConfirm={confirmToggle}
        onClose={() => setConfirmModal(null)}
      />

      <QrModal
        qrModal={qrModal}
        onDownload={downloadSvg}
        onDownloadPng={downloadPng}
        onClose={closeQr}
      />
    </Page>
  );
}
