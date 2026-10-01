import { useId } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { useLastValue } from '../hooks/useLastValue';
import styles from './ModalParts.module.css';

// Without `children` it asks about the pet status change in `confirmModal`.
// Other callers pass any truthy `confirmModal` plus their own text.
export default function ConfirmModal({
    confirmModal,
    onConfirm,
    onClose,
    title = 'Alterar Estado Operacional',
    confirmLabel = 'Confirmar Alteração',
    tone,
    children,
}) {
    const titleId = useId();
    const shown = useLastValue(confirmModal);
    const danger = tone ? tone === 'danger' : shown?.toStatus === 'PERDIDO';

    return (
        <Modal open={Boolean(confirmModal)} onClose={onClose} labelledBy={titleId} tone={danger ? 'danger' : 'default'}>
            {shown && (
                <>
                    <h2 id={titleId} className={styles.title}>{title}</h2>
                    <p className={styles.text}>
                        {children ?? (
                            <>
                                Confirmar alteração de status de <strong>{shown.pet.name}</strong> para{' '}
                                <strong>{shown.toStatus}</strong>?
                            </>
                        )}
                    </p>
                    <Button variant={danger ? 'alert' : 'primary'} block onClick={onConfirm}>{confirmLabel}</Button>
                    <Button variant="secondary" block onClick={onClose}>Cancelar</Button>
                </>
            )}
        </Modal>
    );
}
