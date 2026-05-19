import { useState, useEffect } from 'react';
import axios from 'axios';

export function useScan(petId) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        function doScan(latitude, longitude) {
            axios
                .post(`http://localhost:3000/scan/${petId}`, {
                    latitude,
                    longitude,
                    consentGranted: true,
                    consentVersion: '1.0',
                })
                .then(res => setResult(res.data))
                .catch(() => setError('Pet não encontrado ou erro no servidor.'))
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
    }, [petId]);

    return { result, error, loading };
}