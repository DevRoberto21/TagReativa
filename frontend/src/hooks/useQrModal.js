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

    // Filled squares, no background: 3D tools (Tinkercad, slicers) extrude
    // fills and ignore strokes, and a background rect would merge into one block.
    function renderSvg() {
        const { size, data } = QRCode.create(qrModal.qrCodeUrl, { errorCorrectionLevel: 'Q' }).modules;
        const margin = 2;
        let d = '';
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (data[y * size + x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
            }
        }
        const full = size + margin * 2;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><path fill="#1b4332" d="${d}"/></svg>`;
    }

    function svgFile() {
        return new File([renderSvg()], `qrcode-${qrModal.name}.svg`, { type: 'image/svg+xml' });
    }

    async function downloadSvg() {
        if (!qrModal?.qrCodeUrl) return;
        try {
            const url = URL.createObjectURL(svgFile());
            const a = document.createElement('a');
            a.href = url;
            a.download = `qrcode-${qrModal.name}.svg`;
            a.click();
            // Revoking right after click() cancels the download on mobile Safari.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            alert('Erro ao gerar SVG.');
        }
    }

    async function shareFile(file) {
        try {
            await navigator.share({ files: [file], title: `QR Code - ${qrModal.name}` });
        } catch (err) {
            if (err?.name !== 'AbortError') alert('Erro ao compartilhar arquivo.');
        }
    }

    // Larger than the on-screen preview so the tag prints sharp.
    function renderPng() {
        return QRCode.toDataURL(qrModal.qrCodeUrl, {
            errorCorrectionLevel: 'Q',
            margin: 2,
            width: 1024,
            color: { dark: '#1b4332', light: '#ffffff' },
        });
    }

    async function downloadPng() {
        if (!qrModal?.qrCodeUrl) return;
        try {
            const a = document.createElement('a');
            a.href = await renderPng();
            a.download = `qrcode-${qrModal.name}.png`;
            a.click();
        } catch {
            alert('Erro ao gerar PNG.');
        }
    }

    // Phones can't attach a downloaded file to WhatsApp easily; the native
    // share sheet sends the file straight to the app.
    async function sharePng() {
        if (!qrModal?.qrCodeUrl) return;
        let file;
        try {
            // Decoded by hand: the CSP connect-src blocks fetch() on data: URLs.
            const bytes = Uint8Array.from(atob((await renderPng()).split(',')[1]), (c) => c.charCodeAt(0));
            file = new File([bytes], `qrcode-${qrModal.name}.png`, { type: 'image/png' });
        } catch {
            return alert('Erro ao gerar PNG.');
        }
        await shareFile(file);
    }

    function closeQr() {
        setQrModal(null);
    }

    return { qrModal, openQr, downloadSvg, downloadPng, sharePng, closeQr };
}