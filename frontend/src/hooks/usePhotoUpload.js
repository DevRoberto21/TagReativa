import { useState, useCallback } from 'react';
import getCroppedImg from '../utils/cropImage';

const CLOUD_NAME = 'dan2bsmlk';
const UPLOAD_PRESET = 'tagreativa_pictures';

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
            const formData = new FormData();
            formData.append('file', blob, 'photo.jpg');
            formData.append('upload_preset', UPLOAD_PRESET);
            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
                { method: 'POST', body: formData },
            );
            const data = await res.json();
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