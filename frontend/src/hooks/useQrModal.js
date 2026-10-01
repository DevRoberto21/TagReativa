import { useState } from 'react';
import QRCode from 'qrcode';

export function useQrModal() {
    const [qrModal, setQrModal] = useState(null);

    async function openQr(pet) {
        // The scan page lives on the frontend, so fall back to this app's own origin.
        const targetUrl = pet.qrCodeUrl || `${window.location.origin}/scan/${pet.id}`;
        try {
            const generatedBase64 = await QRCode.toDataURL(targetUrl, {
                margin: 2,
                width: 300,
                color: { dark: '#1b4332', light: '#ffffff' },
            });
            setQrModal({ name: pet.name, qr: generatedBase64, qrCodeUrl: targetUrl });
        } catch {
            alert('Erro ao processar renderização do QR Code.');
        }
    }

    async function downloadSvg() {
        if (!qrModal?.qrCodeUrl) return;
        try {
            const svg = await QRCode.toString(qrModal.qrCodeUrl, {
                type: 'svg',
                color: { dark: '#1b4332', light: '#ffffff' },
            });
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `qrcode-${qrModal.name}.svg`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert('Erro ao gerar SVG.');
        }
    }

    async function downloadPng() {
        if (!qrModal?.qrCodeUrl) return;
        try {
            // Larger than the on-screen preview so the tag prints sharp.
            const png = await QRCode.toDataURL(qrModal.qrCodeUrl, {
                margin: 2,
                width: 1024,
                color: { dark: '#1b4332', light: '#ffffff' },
            });
            const a = document.createElement('a');
            a.href = png;
            a.download = `qrcode-${qrModal.name}.png`;
            a.click();
        } catch {
            alert('Erro ao gerar PNG.');
        }
    }

    function closeQr() {
        setQrModal(null);
    }

    return { qrModal, openQr, downloadSvg, downloadPng, closeQr };
}