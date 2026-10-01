import { useId } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { useLastValue } from '../hooks/useLastValue';
import styles from './ModalParts.module.css';

export default function QrModal({ qrModal, onDownload, onDownloadPng, onClose }) {
    const titleId = useId();
    const shown = useLastValue(qrModal);

    return (
        <Modal open={Boolean(qrModal)} onClose={onClose} labelledBy={titleId}>
            {shown && (
                <>
                    <p className={styles.eyebrow}>Identificador</p>
                    <h2 id={titleId} className={styles.title}>{shown.name}</h2>
                    <div className={styles.qrPlate}>
                        <img src={shown.qr} alt="QR Code" className={styles.qrImg} />
                    </div>
                    <div className={styles.row}>
                        <Button variant="secondary" size="sm" onClick={onDownloadPng}>Baixar Imagem (.PNG)</Button>
                        <Button variant="secondary" size="sm" onClick={onDownload}>Exportar Vetor (.SVG)</Button>
                    </div>
                    <Button block onClick={onClose}>Fechar Janela</Button>
                </>
            )}
        </Modal>
    );
}
