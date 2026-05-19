import { useState } from 'react';
import QRCode from 'qrcode';

export function useQrModal() {
    const [qrModal, setQrModal] = useState(null);

    async function openQr(pet) {
        const targetUrl = pet.qrCodeUrl || `http://localhost:3000/scan/${pet.id}`;
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

    function closeQr() {
        setQrModal(null);
    }

    return { qrModal, openQr, downloadSvg, closeQr };
}