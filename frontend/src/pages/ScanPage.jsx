import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useScan } from '../hooks/useScan';
import Page from '../components/ui/Page';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import Icon from '../components/ui/Icon';
import PetAvatar from '../components/ui/PetAvatar';
import ScanLoader from '../components/ui/ScanLoader';
import { rise } from '../components/ui/motionPresets';
import { cx } from '../utils/cx';
import styles from './ScanPage.module.css';

// The page hides the pet and owner data after this long so a scan left open
// on a phone does not keep exposing the owner's contact indefinitely.
const SESSION_SECONDS = 5 * 60;

function useCountdown(active) {
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);

  useEffect(() => {
    if (!active) return;
    // Derive from a fixed deadline: mobile browsers throttle intervals in
    // background tabs, so counting ticks would drift.
    const deadline = Date.now() + SESSION_SECONDS * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return secondsLeft;
}

function formatSeconds(total) {
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Shown before any data is collected, so the browser's location prompt never
// appears unexplained. Wording changes must bump CONSENT_VERSION in useScan.
function ConsentScreen({ onChoose }) {
  return (
    <Page center>
      <Panel className={styles.consent}>
        <Icon name="shield" size={32} className={styles.consentIcon} />
        <h1 className={styles.messageTitle}>Antes de continuar</h1>
        <p className={styles.sub}>
          Você leu a tag de um pet. Se ele estiver perdido, o tutor recebe um alerta por e-mail.
          Nas duas opções abaixo você vê os dados do pet e o contato do tutor.
        </p>

        <div className={styles.notes}>
          <span className={styles.label}>Como seus dados são usados</span>
          <ul className={styles.consentList}>
            <li>
              <strong>Localização, só se você permitir.</strong> A posição do seu aparelho vai no alerta ao tutor,
              para ele encontrar o pet. É lida uma única vez, agora. Você não é acompanhado depois.
            </li>
            <li>
              <strong>Endereço IP e identificador do aparelho.</strong> Registrados sempre, só para evitar abuso
              (leituras repetidas e alertas falsos). Não vão para o tutor nem para terceiros e não são usados para
              descobrir onde você está.
            </li>
          </ul>
        </div>

        <div className={styles.action}>
          <Button size="lg" block icon="signal" onClick={() => onChoose(true)}>
            Compartilhar minha localização
          </Button>
          <Button size="lg" block variant="secondary" onClick={() => onChoose(false)}>
            Continuar sem localização
          </Button>
        </div>

        <p className={styles.consentFoot}>
          Ao compartilhar, o navegador pede permissão de localização; você ainda pode negar ali.
          Base legal (LGPD, Lei 13.709/2018): consentimento para a localização e legítimo interesse para o IP.
        </p>
      </Panel>
    </Page>
  );
}

export default function ScanPage() {
  const { petId } = useParams();
  const [shareLocation, setShareLocation] = useState(null);
  const { status, result, error, loading } = useScan(petId, shareLocation);
  const secondsLeft = useCountdown(Boolean(result));

  if (status === 'LOST' && shareLocation == null && !error) {
    return <ConsentScreen onChoose={setShareLocation} />;
  }

  if (loading) {
    return (
      <Page center>
        <ScanLoader label={status ? 'Registrando leitura da tag...' : 'Lendo a tag...'} />
      </Page>
    );
  }

  if (error) {
    return (
      <Page center>
        <Panel tone="alert" className={styles.message}>
          <Icon name="alert" size={32} className={styles.messageError} />
          <p className={styles.messageError} role="alert">{error}</p>
        </Panel>
      </Page>
    );
  }

  if (!result) return null;

  if (secondsLeft === 0) {
    return (
      <Page center>
        <Panel className={styles.message}>
          <p className={styles.messageTitle}>Sessão expirada</p>
          <p className={styles.messageSub}>Por segurança, os dados do pet ficam visíveis por 5 minutos. Escaneie o QR code novamente para ver as informações.</p>
          <Button block onClick={() => window.location.reload()}>
            Carregar novamente
          </Button>
        </Panel>
      </Page>
    );
  }

  const { pet, owner, ownerNotified } = result;
  const isLost = pet?.status === 'LOST';
  const whatsappHref = owner?.whatsappHref ?? null;
  const hasNotes = Boolean(pet?.notes && pet.notes.trim() !== '');

  return (
    <Page center>
      <Panel tone={isLost ? 'alert' : 'signal'} brackets={false} className={styles.card}>
        <motion.div className={cx(styles.band, isLost && styles.bandLost)} variants={rise} custom={2}>
          <Icon name={isLost ? 'alert' : 'check'} size={22} />
          <span>{isLost ? 'Sistema de Resgate Ativo' : 'Este pet está seguro'}</span>
        </motion.div>

        <p className={cx(styles.countdown, secondsLeft <= 60 && styles.countdownLow)}>
          Dados visíveis por mais {formatSeconds(secondsLeft)}
        </p>

        <motion.div className={styles.identity} variants={rise} custom={4}>
          <PetAvatar pet={pet} size={148} width={600} lost={isLost} ping={isLost} />
          <div>
            <h1 className={styles.name}>{pet?.name}</h1>
            <p className={styles.species}>{pet?.species}</p>
          </div>
        </motion.div>

        <motion.div className={styles.notes} variants={rise} custom={6}>
          <span className={styles.label}>Observações do Tutor</span>
          <p className={cx(styles.notesText, !hasNotes && styles.notesEmpty)}>
            {hasNotes ? pet.notes : 'Nenhuma instrução de cuidado específica foi registrada.'}
          </p>
        </motion.div>

        <motion.div className={styles.action} variants={rise} custom={8}>
          {isLost ? (
            <>
              <p className={styles.sub}>Este animal foi reportado como perdido. Utilize o canal abaixo para alertar o tutor:</p>
              {!ownerNotified && (
                <Notice tone="warn" className={styles.notice}>O tutor já foi avisado recentemente. Fale direto com ele pelo WhatsApp abaixo.</Notice>
              )}
              {owner?.name && (
                <p className={styles.owner}>Tutor: {owner.name}</p>
              )}
              {whatsappHref ? (
                <Button size="lg" block href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  Contatar Tutor via WhatsApp
                </Button>
              ) : (
                <Notice tone="error" className={styles.notice}>Contato indisponível no momento.</Notice>
              )}
            </>
          ) : (
            <>
              <div className={styles.safe} role="status">
                <Icon name="shield" size={28} className={styles.safeIcon} />
                <div>
                  <p className={styles.safeTitle}>{pet?.name ?? 'Este pet'} não está perdido</p>
                  <p className={styles.sub}>O tutor não informou nenhum desaparecimento. Você não precisa fazer nada.</p>
                </div>
              </div>
              <p className={styles.consentFoot}>
                Sua localização não foi coletada. Registramos só o endereço IP e o identificador do aparelho, para evitar abuso.
              </p>
            </>
          )}
        </motion.div>
      </Panel>
    </Page>
  );
}
