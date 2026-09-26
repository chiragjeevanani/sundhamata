import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react';

/**
 * Full-screen viewer for a product photo.
 * Tap the image to zoom (then drag/scroll to pan); close with ✕, the backdrop,
 * Escape or the device back button. Pinch-zoom is disabled app-wide by the
 * viewport meta tag, so zoom is handled here.
 */
export const ImageViewerModal = ({ isOpen, ...props }) =>
  createPortal(<AnimatePresence>{isOpen && <Viewer {...props} />}</AnimatePresence>, document.body);

// Mounted only while open, so zoom state starts fresh every time.
const Viewer = ({ onClose, src, alt, caption }) => {
  const [zoomed, setZoomed] = useState(false);

  // While open, the viewer owns one history entry so the phone's Back button closes it
  // instead of leaving the page. Every close goes through history.back(); the popstate
  // handler then performs the actual close, so there is a single, consistent path.
  const close = () => {
    if (window.history.state?.imageViewer) window.history.back();
    else onClose();
  };

  useEffect(() => {
    // Guarded so React StrictMode's double effect run adds only one entry.
    if (!window.history.state?.imageViewer) {
      window.history.pushState({ ...window.history.state, imageViewer: true }, '');
    }
    const onPop = () => {
      if (!window.history.state?.imageViewer) onClose();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (window.history.state?.imageViewer) window.history.back();
      else onClose();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Product photo'}
      onClick={close}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-semibold truncate">{caption}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setZoomed((z) => !z)}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
            aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
          >
            {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </button>
          <button
            onClick={close}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className={`flex-1 min-h-0 ${zoomed ? 'overflow-auto' : 'overflow-hidden flex items-center justify-center p-3'}`}>
        <motion.img
          src={src}
          alt={alt}
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((z) => !z);
          }}
          className={
            zoomed
              ? 'max-w-none w-[250%] sm:w-[200%] h-auto cursor-zoom-out select-none'
              : 'w-full h-full object-contain cursor-zoom-in select-none'
          }
          draggable={false}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 text-xs text-white/70 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span>{zoomed ? 'Drag to move · tap to zoom out' : 'Tap the photo to zoom'}</span>
        <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white hover:underline">
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open full size</span>
        </a>
      </div>
    </motion.div>
  );
};
