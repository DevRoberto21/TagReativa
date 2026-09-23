const STORAGE_KEY = 'tagreativa_device_id';

// crypto.randomUUID only exists in secure contexts (HTTPS/localhost), and the
// scan page is also opened over plain HTTP on the LAN during development.
function generateUuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Anonymous per-browser id used by the backend to rate-limit scan alerts per
// device. Returns undefined when storage is unavailable (private mode, blocked
// site data); the scan then falls under the pet-wide limit only.
export function getDeviceId() {
    try {
        let id = localStorage.getItem(STORAGE_KEY);
        if (!id) {
            id = generateUuid();
            localStorage.setItem(STORAGE_KEY, id);
        }
        return id;
    } catch {
        return undefined;
    }
}
