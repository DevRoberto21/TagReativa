export default function QrModal({ qrModal, onDownload, onClose }) {
    if (!qrModal) return null;

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 style={styles.modalTitle}>Identificador — {qrModal.name}</h2>
                <div style={styles.qrWrapper}>
                    <img src={qrModal.qr} alt="QR Code" style={styles.qrImg} />
                </div>
                <button onClick={onDownload} style={styles.svgBtn}>Exportar Vetor (.SVG)</button>
                <button onClick={onClose} style={styles.closeBtn}>Fechar Janela</button>
            </div>
        </div>
    );
}

const styles = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(27, 67, 50, 0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modal: { background: '#FFF', borderRadius: '20px', padding: '28px', textAlign: 'center', maxWidth: '320px', width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' },
    modalTitle: { fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: '#1B4332' },
    qrWrapper: { background: '#F4F7F6', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '16px' },
    qrImg: { width: '180px', height: '180px', display: 'block' },
    svgBtn: { display: 'block', width: '100%', padding: '11px', borderRadius: '10px', background: '#FFF', border: '1px solid #CBDCD0', color: '#2D6A4F', fontWeight: 600, fontSize: '13px', cursor: 'pointer', marginBottom: '8px' },
    closeBtn: { display: 'block', width: '100%', padding: '11px', borderRadius: '10px', background: '#2D6A4F', color: '#FFF', border: 'none', fontWeight: 600, cursor: 'pointer' },
};