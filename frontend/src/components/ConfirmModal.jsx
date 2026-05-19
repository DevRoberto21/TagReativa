export default function ConfirmModal({ confirmModal, onConfirm, onClose }) {
    if (!confirmModal) return null;

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 style={styles.modalTitle}>Alterar Estado Operacional</h2>
                <p style={styles.modalText}>
                    Confirmar alteração de status de <strong>{confirmModal.pet.name}</strong> para{' '}
                    <strong>{confirmModal.toStatus}</strong>?
                </p>
                <button
                    onClick={onConfirm}
                    style={{
                        ...styles.confirmBtn,
                        background: confirmModal.toStatus === 'PERDIDO' ? '#E63946' : '#2D6A4F',
                    }}
                >
                    Confirmar Alteração
                </button>
                <button onClick={onClose} style={styles.cancelBtn}>Cancelar</button>
            </div>
        </div>
    );
}

const styles = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(27, 67, 50, 0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modal: { background: '#FFF', borderRadius: '20px', padding: '28px', textAlign: 'center', maxWidth: '320px', width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' },
    modalTitle: { fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: '#1B4332' },
    modalText: { fontSize: '13px', color: '#40665A', marginBottom: '20px', lineHeight: '1.5' },
    confirmBtn: { display: 'block', width: '100%', padding: '11px', borderRadius: '10px', color: '#FFF', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginBottom: '8px' },
    cancelBtn: { display: 'block', width: '100%', padding: '11px', borderRadius: '10px', background: '#FFF', border: '1px solid #CBDCD0', color: '#2D6A4F', fontWeight: 600, fontSize: '13px', cursor: 'pointer' },
};