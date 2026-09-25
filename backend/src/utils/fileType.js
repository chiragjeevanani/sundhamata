import path from 'node:path';

// Purchase bills: which files are accepted, decided from the file's actual bytes
// (never from the client-supplied name or Content-Type). Scriptable formats such as
// HTML, SVG and JavaScript are deliberately not allowed.

export const MAX_BILL_BYTES = 10 * 1024 * 1024;
export const MAX_BILL_MB = MAX_BILL_BYTES / (1024 * 1024);

const startsWith = (buf, signature, offset = 0) =>
  buf.length >= offset + signature.length && signature.every((byte, i) => buf[offset + i] === byte);

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy Office (.doc / .xls)
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

export const BILL_TYPES = Object.freeze([
  { key: 'pdf', label: 'PDF', mime: 'application/pdf', exts: ['pdf'], matches: (b) => b.subarray(0, 1024).includes('%PDF-') },
  { key: 'jpeg', label: 'JPEG image', mime: 'image/jpeg', exts: ['jpg', 'jpeg'], matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { key: 'png', label: 'PNG image', mime: 'image/png', exts: ['png'], matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { key: 'gif', label: 'GIF image', mime: 'image/gif', exts: ['gif'], matches: (b) => b.toString('latin1', 0, 6) === 'GIF87a' || b.toString('latin1', 0, 6) === 'GIF89a' },
  { key: 'webp', label: 'WebP image', mime: 'image/webp', exts: ['webp'], matches: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  {
    key: 'heic',
    label: 'HEIC image',
    mime: 'image/heic',
    exts: ['heic', 'heif'],
    matches: (b) => b.toString('latin1', 4, 8) === 'ftyp' && HEIF_BRANDS.includes(b.toString('latin1', 8, 12)),
  },
  {
    key: 'docx',
    label: 'Word document',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    exts: ['docx'],
    matches: (b) => startsWith(b, ZIP) && b.includes('word/document.xml'),
  },
  { key: 'doc', label: 'Word document', mime: 'application/msword', exts: ['doc'], matches: (b, ext) => startsWith(b, OLE) && ext === 'doc' },
  {
    key: 'xlsx',
    label: 'Excel spreadsheet',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    exts: ['xlsx'],
    matches: (b) => startsWith(b, ZIP) && b.includes('xl/workbook.xml'),
  },
  { key: 'xls', label: 'Excel spreadsheet', mime: 'application/vnd.ms-excel', exts: ['xls'], matches: (b, ext) => startsWith(b, OLE) && ext === 'xls' },
]);

export const ALLOWED_BILL_EXTENSIONS = BILL_TYPES.flatMap((type) => type.exts);

const extensionOf = (filename) => path.extname(String(filename ?? '')).slice(1).toLowerCase();

/** @returns the matching entry of BILL_TYPES, or null when the bytes are not an accepted format */
export const detectBillType = (buffer, filename) => {
  const ext = extensionOf(filename);
  return BILL_TYPES.find((type) => type.matches(buffer, ext)) ?? null;
};

/**
 * A safe file name for storage and download: no path parts or control characters,
 * bounded length, and an extension that matches the detected type.
 */
export const buildBillFilename = (rawName, type) => {
  const cleaned = path.posix
    .basename(String(rawName ?? '').replace(/\\/g, '/'))
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 ? cleaned.slice(dot + 1).toLowerCase() : '';
  const stem = (dot > 0 ? cleaned.slice(0, dot) : cleaned).trim().slice(0, 100) || 'bill';
  return `${stem}.${type.exts.includes(ext) ? ext : type.exts[0]}`;
};

/** Content-Disposition value that forces a download and survives non-ASCII names. */
export const attachmentDisposition = (filename) => {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};
