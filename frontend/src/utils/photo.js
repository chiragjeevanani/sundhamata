// Sundhamata Mobile - profile photos: shrink on the device before uploading, so a 10 MB phone
// photo becomes a ~60 KB square JPEG (fast on mobile data, and the server limit is 5 MB).

export const PHOTO_ACCEPT = 'image/*';

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This photo could not be opened. Try a JPG or PNG photo.'));
    };
    img.src = url;
  });

/**
 * Centre-crops the photo to a square and scales it to `size` px (JPEG).
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export const toSquarePhoto = async (file, size = 512) => {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a photo (JPG or PNG).');
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const target = Math.min(size, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; // transparent PNGs get a white background
  ctx.fillRect(0, 0, target, target);
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, target, target);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('This photo could not be processed. Try another one.');
  return blob;
};

/**
 * Scales a photo down so its longer side is at most `maxSide` px, keeping its shape (JPEG).
 * Used for photos of a problem, where cropping could cut off the damage.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export const toScaledPhoto = async (file, maxSide = 1600) => {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a photo (JPG or PNG).');
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('This photo could not be processed. Try another one.');
  return blob;
};
