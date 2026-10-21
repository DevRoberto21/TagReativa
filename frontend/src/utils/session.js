// The JWT lives in an httpOnly cookie that scripts cannot read. This flag only
// tells the router whether to show private pages; the API still decides.
const KEY = 'signed_in';

export function markSignedIn() {
  try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
}

export function markSignedOut() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('access_token'); // left by the old bearer flow
  } catch { /* storage blocked */ }
}

export function isSignedIn() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
