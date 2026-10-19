import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getDeviceId } from '../utils/deviceId';
import { isShortCode, isUuid } from '../utils/routeParams';

// Bump when the consent text on ScanPage changes, so each scan log records
// which wording the finder agreed to.
const CONSENT_VERSION = '2.0';

// shareLocation: null until the finder picks on the consent screen; nothing is
// sent or requested before that.
export function useScan(petId, shareLocation) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const sentFor = useRef(null);
    const validId = isUuid(petId) || isShortCode(petId);

    useEffect(() => {
        if (!validId || shareLocation == null) return;
        // StrictMode runs effects twice in development; without this guard every
        // page open would register two scans and send two alerts.
        if (sentFor.current === petId) return;
        sentFor.current = petId;

        function doScan(latitude, longitude) {
            api
                .post(`/scan/${petId}`, {
                    latitude,
                    longitude,
                    consentGranted: shareLocation,
                    consentVersion: CONSENT_VERSION,
                    deviceId: getDeviceId(),
                })
                .then(res => setResult(res.data))
                .catch((err) => {
                    console.error('[SCAN ERROR]', err.response?.status, err.response?.data);
                    setError(
                        err.response?.status === 429
                            ? 'Muitas leituras seguidas deste aparelho. Aguarde 1 minuto e escaneie novamente.'
                            : 'Pet não encontrado ou erro no servidor.',
                    );
                })
                .finally(() => setLoading(false));
        }

        if (!shareLocation || !navigator.geolocation) {
            doScan();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            pos => doScan(pos.coords.latitude, pos.coords.longitude),
            // Denied or timed out: scan goes out without any location.
            () => doScan(),
            { timeout: 5000 },
        );
    }, [petId, validId, shareLocation]);

    if (!validId) {
        return { result: null, error: 'Pet não encontrado ou erro no servidor.', loading: false };
    }
    return { result, error, loading };
}