const MAX_OUTPUT_DIMENSION = 800;

export default async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.src = imageSrc;
  });

  const scale = Math.min(
    1,
    MAX_OUTPUT_DIMENSION / Math.max(pixelCrop.width, pixelCrop.height),
  );
  const targetWidth = Math.round(pixelCrop.width * scale);
  const targetHeight = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
  });
}
