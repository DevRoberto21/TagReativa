import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import Cropper from 'react-easy-crop';
import PetAvatar from './ui/PetAvatar';
import Button from './ui/Button';
import styles from './PhotoPicker.module.css';

// `upload` is the object returned by usePhotoUpload().
export default function PhotoPicker({ upload, label, alt = 'Pet' }) {
    const {
        photoUrl,
        showCropper,
        uploading,
        rawImage,
        crop,
        setCrop,
        zoom,
        setZoom,
        handleFileChange,
        onCropComplete,
        handleCropConfirm,
        cancelCrop,
    } = upload;

    return (
        <div className={styles.picker}>
            <PetAvatar pet={{ photoUrl, name: alt }} size={96} />
            <label className={styles.pick}>
                {label}
                <input type="file" accept="image/*" onChange={handleFileChange} className={styles.file} />
            </label>

            {createPortal(
                <AnimatePresence>
                    {showCropper && (
                        <motion.div
                            className={styles.overlay}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.16 }}
                        >
                            <motion.div
                                className={styles.box}
                                initial={{ scale: 0.96, y: 10 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            >
                                <div className={styles.area}>
                                    <Cropper
                                        image={rawImage} crop={crop} zoom={zoom} aspect={1} cropShape="rect" showGrid={false}
                                        onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
                                    />
                                </div>
                                <input
                                    type="range" min={1} max={3} step={0.01} value={zoom}
                                    onChange={e => setZoom(Number(e.target.value))}
                                    className={styles.slider}
                                    aria-label="Zoom"
                                />
                                <div className={styles.buttons}>
                                    <Button variant="secondary" onClick={cancelCrop}>Cancelar</Button>
                                    <Button onClick={handleCropConfirm} disabled={uploading}>
                                        {uploading ? 'Enviando...' : 'Confirmar'}
                                    </Button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </div>
    );
}
