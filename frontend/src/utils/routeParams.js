// Route params are placed in API paths. react-router decodes %2F, so a crafted
// link such as /scan/..%2Fauth%2F2fa%2Fenable could pick the endpoint; only
// these formats may reach a path. Same rules as the backend (src/pets/short-code.ts).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/i;

export function isUuid(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isShortCode(value) {
    return typeof value === 'string' && SHORT_CODE_PATTERN.test(value);
}
