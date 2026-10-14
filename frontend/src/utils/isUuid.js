const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route params are placed in API paths; only a UUID is allowed there, so a
// crafted link such as /scan/..%2Fauth%2F2fa%2Fenable cannot pick the endpoint.
export function isUuid(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}
