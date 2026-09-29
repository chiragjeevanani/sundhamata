import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { CameraOff, Loader2, ScanLine, X } from 'lucide-react';

/**
 * Scans a QR code with the device camera (e.g. a customer's coupon shown on their phone).
 * USB / Bluetooth barcode scanners do not need this: they type the code into the input directly.
 */
export const QrScannerModal = ({ isOpen, onClose, onScan, title = 'Scan QR Code' }) =>
  isOpen ? createPortal(<Scanner onClose={onClose} onScan={onScan} title={title} />, document.body) : null;

const Scanner = ({ onClose, onScan, title }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraSupported = Boolean(navigator.mediaDevices?.getUserMedia);
  const [error, setError] = useState(cameraSupported ? '' : 'This browser cannot use the camera. Type the code instead.');
  const [starting, setStarting] = useState(cameraSupported);

  useEffect(() => {
    let stream = null;
    let frame = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, width, height);
        const found = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          stopped = true;
          onScan(found.data.trim());
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    if (!cameraSupported) return undefined;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        video.srcObject = s;
        video.setAttribute('playsinline', 'true');
        return video.play().then(() => {
          setStarting(false);
          frame = requestAnimationFrame(tick);
        });
      })
      .catch((err) => {
        setStarting(false);
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site, or type the code instead.'
            : 'No camera found. Type the code instead.'
        );
      });

    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      window.removeEventListener('keydown', onKey);
    };
  }, [cameraSupported, onClose, onScan]);

  return (
    <div className="fixed inset-0 z-[70] bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-xl overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <span className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-brand-600" />
            {title}
          </span>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close scanner">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" muted />
          <canvas ref={canvasRef} className="hidden" />
          {!error && (
            <div className="absolute inset-[18%] border-2 border-white/80 rounded-xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          )}
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-stone-200 text-xs">
              <CameraOff className="w-7 h-7" />
              {error}
            </div>
          )}
        </div>
        <p className="px-4 py-3 text-[11px] text-stone-500 text-center">
          Point the camera at the QR code on the customer's phone.
        </p>
      </div>
    </div>
  );
};
