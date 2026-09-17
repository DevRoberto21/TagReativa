import { useState, useCallback } from 'react';
import getCroppedImg from '../utils/cropImage';
import api from '../services/api';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function usePhotoUpload(initialUrl = '') {
    const [photoUrl, setPhotoUrl] = useState(initialUrl);
    const [rawImage, setRawImage] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [showCropper, setShowCropper] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    function handleFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        setUploadError(null);

        if (!ALLOWED_TYPES.includes(file.type)) {
            setUploadError('Formato de imagem não suportado. Use JPEG, PNG ou WEBP.');
            e.target.value = '';
            return;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setUploadError('Arquivo muito grande. Tamanho máximo: 5MB.');
            e.target.value = '';
            return;
        }

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
        setUploadError(null);
        try {
            const blob = await getCroppedImg(rawImage, croppedAreaPixels);
            const { data: sig } = await api.post('/pets/photo-upload-signature');

            const formData = new FormData();
            formData.append('file', blob, 'photo.jpg');
            formData.append('api_key', sig.apiKey);
            formData.append('timestamp', sig.timestamp);
            formData.append('signature', sig.signature);
            formData.append('upload_preset', sig.uploadPreset);

            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
                { method: 'POST', body: formData },
            );
            const data = await res.json();
            if (!data.secure_url) {
                throw new Error('Cloudinary upload did not return a secure_url');
            }
            setPhotoUrl(data.secure_url);
            setShowCropper(false);
        } catch {
            setUploadError('Erro ao fazer upload da foto.');
        } finally {
            setUploading(false);
        }
    }

    function cancelCrop() {
        setShowCropper(false);
    }

    return {
        photoUrl,
        setPhotoUrl,
        showCropper,
        uploading,
        uploadError,
        rawImage,
        crop,
        setCrop,
        zoom,
        setZoom,
        handleFileChange,
        onCropComplete,
        handleCropConfirm,
        cancelCrop,
    };
}
