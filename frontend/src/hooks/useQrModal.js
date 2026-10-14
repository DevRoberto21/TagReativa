import { useState } from 'react';
import QRCode from 'qrcode';

export function useQrModal() {
    const [qrModal, setQrModal] = useState(null);

    async function openQr(pet) {
        // The scan page lives on this app's own origin. Upper-cased as a whole so
        // the QR uses alphanumeric mode, which gives a smaller code to print.
        const targetUrl = `${window.location.origin}/s/${pet.shortCode}`.toUpperCase();
        try {
            const generatedBase64 = await QRCode.toDataURL(targetUrl, {
                errorCorrectionLevel: 'Q',
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
                errorCorrectionLevel: 'Q',
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
                errorCorrectionLevel: 'Q',
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