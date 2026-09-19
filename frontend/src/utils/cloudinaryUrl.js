export function cloudinaryUrl(url, { width } = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const transform = width ? `f_auto,q_auto,w_${width}` : 'f_auto,q_auto';
  return url.replace('/upload/', `/upload/${transform}/`);
}
