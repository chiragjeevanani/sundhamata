import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { CustomerAvatar } from './CustomerAvatar';
import { PHOTO_ACCEPT, toSquarePhoto } from '../utils/photo';

/**
 * Customer photo with a camera button: take a photo (phone camera), choose one, or remove it.
 * The photo is resized on the device before `onUpload(blob)` is called.
 */
export const PhotoEditor = ({
  customer,
  onUpload,
  onRemove,
  className = 'w-16 h-16 rounded-2xl',
  textClassName = 'text-lg',
  onError,
  labels = { take: 'Take photo', choose: 'Choose from gallery', remove: 'Remove photo' },
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleFile = async (file) => {
    setMenuOpen(false);
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(await toSquarePhoto(file));
    } catch (err) {
      onError?.(err.message || 'Could not update the photo.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setMenuOpen(false);
    setBusy(true);
    try {
      await onRemove();
    } catch (err) {
      onError?.(err.message || 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  };

  const fileInput = (ref, capture) => (
    <input
      ref={ref}
      type="file"
      accept={PHOTO_ACCEPT}
      {...(capture ? { capture: 'user' } : {})}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        handleFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        disabled={busy}
        className="relative block cursor-pointer group"
        aria-label={customer?.photoUrl ? 'Change photo' : 'Add photo'}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <CustomerAvatar customer={customer} className={className} textClassName={textClassName} />
        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-600 text-white border-2 border-white flex items-center justify-center shadow-sm group-hover:bg-brand-700">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
        </span>
      </button>

      {fileInput(cameraRef, true)}
      {fileInput(galleryRef, false)}

      {menuOpen && (
        <div role="menu" className="absolute left-0 top-full mt-2 z-40 w-48 bg-white rounded-xl border border-stone-200 shadow-lg py-1 text-xs">
          <button
            type="button"
            role="menuitem"
            onClick={() => cameraRef.current?.click()}
            className="w-full px-3 py-2 flex items-center gap-2 text-left text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-brand-600" />
            {labels.take}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => galleryRef.current?.click()}
            className="w-full px-3 py-2 flex items-center gap-2 text-left text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5 text-brand-600" />
            {labels.choose}
          </button>
          {customer?.photoUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={handleRemove}
              className="w-full px-3 py-2 flex items-center gap-2 text-left text-rose-700 hover:bg-rose-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {labels.remove}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
