// Joins class names, skipping falsy entries.
export function cx(...names) {
  return names.filter(Boolean).join(' ');
}
