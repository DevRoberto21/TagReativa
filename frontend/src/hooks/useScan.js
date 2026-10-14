import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getDeviceId } from '../utils/deviceId';
import { isUuid } from '../utils/isUuid';

export function useScan(petId) {
    const valid = isUuid(petId);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(
        valid ? null : 'Pet não encontrado ou erro no servidor.',
    );
    const [loading, setLoading] = useState(valid);
    const sentFor = useRef(null);

    useEffect(() => {
        if (!valid) return;
        // StrictMode runs effects twice in development; without this guard every
        // page open would register two scans and send two alerts.
        if (sentFor.current === petId) return;
        sentFor.current = petId;

        function doScan(latitude, longitude) {
            api
                .post(`/scan/${petId}`, {
                    latitude,
                    longitude,
                    consentGranted: true,
                    consentVersion: '1.0',
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

        if (!navigator.geolocation) {
            doScan();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            pos => doScan(pos.coords.latitude, pos.coords.longitude),
            () => doScan(),
            { timeout: 5000 },
        );
    }, [petId, valid]);

    return { result, error, loading };
}