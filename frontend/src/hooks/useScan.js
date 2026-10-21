import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getDeviceId } from '../utils/deviceId';
import { isShortCode, isUuid } from '../utils/routeParams';

// Bump when the consent text on ScanPage changes, so each scan log records
// which wording the finder agreed to.
const CONSENT_VERSION = '2.0';

const NOT_FOUND = 'Pet não encontrado ou erro no servidor.';

// Status is read first: a pet that is not lost is scanned right away without
// location, so the finder only sees the consent screen when it matters.
// shareLocation: null until the finder picks on the consent screen; no
// location is requested before that.
export function useScan(petId, chosenShareLocation) {
    const [status, setStatus] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const sentFor = useRef(null);
    const validId = isUuid(petId) || isShortCode(petId);
    const shareLocation = status === 'SAFE' ? false : chosenShareLocation;

    useEffect(() => {
        if (!validId) return;
        api
            .get(`/scan/${petId}/status`)
            .then(res => setStatus(res.data.status))
            .catch(() => {
                setError(NOT_FOUND);
                setLoading(false);
            });
    }, [petId, validId]);

    useEffect(() => {
        if (!validId || status == null || shareLocation == null) return;
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
                            : NOT_FOUND,
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
    }, [petId, validId, status, shareLocation]);

    if (!validId) {
        return { status: null, result: null, error: NOT_FOUND, loading: false };
    }
    return { status, result, error, loading };
}