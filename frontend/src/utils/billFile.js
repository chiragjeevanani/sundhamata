// Sundhamata Mobile - purchase bill helpers (mirrors the server-side rules in backend/src/utils/fileType.js;
// the server re-checks everything, this only gives quick feedback before uploading).

export const MAX_BILL_BYTES = 10 * 1024 * 1024;
export const BILL_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'doc', 'docx', 'xls', 'xlsx'];
/** Value for <input type="file" accept="..."> */
export const BILL_ACCEPT = BILL_EXTENSIONS.map((ext) => `.${ext}`).join(',');
export const BILL_HINT = 'PDF, image, Word or Excel • up to 10 MB';

const extensionOf = (name = '') => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

/** @returns {string|null} an error message, or null when the file looks acceptable */
export const validateBillFile = (file) => {
  if (!file) return null;
  if (!BILL_EXTENSIONS.includes(extensionOf(file.name))) {
    return 'Unsupported file. Choose a PDF, image (JPG, PNG, WebP, GIF, HEIC), Word or Excel file.';
  }
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_BILL_BYTES) return `File is too large (${formatFileSize(file.size)}). Maximum is 10 MB.`;
  return null;
};

export const formatFileSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Saves a Blob to the user's device under the given file name. */
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

// ---- Product photos (server accepts JPG, PNG, WebP, GIF up to 5 MB)
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif';

/** @returns {string|null} an error message, or null when the image looks acceptable */
export const validateImageFile = (file) => {
  if (!file) return null;
  if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensionOf(file.name))) {
    return 'Choose a JPG, PNG, WebP or GIF image.';
  }
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_IMAGE_BYTES) return `Image is too large (${formatFileSize(file.size)}). Maximum is 5 MB.`;
  return null;
};
