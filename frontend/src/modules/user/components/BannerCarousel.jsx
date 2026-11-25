import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bannerImageUrl } from '../../../services/bannerService';

const AUTOPLAY_MS = 4000;
// After the customer swipes, wait this long before moving on by itself
const RESUME_AFTER_MS = 8000;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const scrollToSlide = (track, i) => {
  if (track) track.scrollTo({ left: i * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
};

/**
 * Swipeable banner carousel (one banner = a plain banner). Slides move on by themselves
 * every few seconds; a tap opens the banner's link (an app screen or a website).
 * @param {{ banners: Array<{ id, title, link, imagePath, width, height }> }} props
 */
export const BannerCarousel = ({ banners }) => {
  const navigate = useNavigate();
  const trackRef = useRef(null);
  const pausedUntil = useRef(0);
  const [index, setIndex] = useState(0);
  const count = banners.length;

  // The first banner's shape sets the height, so the page does not jump between slides
  const first = banners[0];
  const ratio = first?.width && first?.height ? `${first.width} / ${first.height}` : '12 / 5';

  useEffect(() => {
    if (count < 2) return undefined;
    const timer = setInterval(() => {
      const track = trackRef.current;
      if (!track || Date.now() < pausedUntil.current || document.hidden) return;
      const current = Math.round(track.scrollLeft / track.clientWidth);
      scrollToSlide(track, (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count]);

  const onScroll = () => {
    const track = trackRef.current;
    if (track?.clientWidth) setIndex(Math.min(count - 1, Math.round(track.scrollLeft / track.clientWidth)));
  };

  const pause = () => {
    pausedUntil.current = Date.now() + RESUME_AFTER_MS;
  };

  const open = (link) => {
    if (!link) return;
    if (link.startsWith('/')) {
      navigate(link);
      return;
    }
    // Inside the app's WebView a new window may be blocked: open it in place instead
    const win = window.open(link, '_blank', 'noopener,noreferrer');
    if (!win) window.location.assign(link);
  };

  if (!count) return null;

  return (
    <section aria-roledescription="carousel" aria-label="Offers" className="space-y-1.5">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={pause}
        onTouchStart={pause}
        className="flex overflow-x-auto snap-x snap-mandatory rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ aspectRatio: ratio }}
      >
        {banners.map((banner, i) => {
          const image = (
            <img
              src={bannerImageUrl(banner.imagePath)}
              alt={banner.title || 'Offer'}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              className="w-full h-full object-cover select-none"
            />
          );
          return (
            <div
              key={banner.id}
              className="w-full h-full shrink-0 snap-center bg-stone-100"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
            >
              {banner.link ? (
                <button type="button" onClick={() => open(banner.link)} className="block w-full h-full cursor-pointer">
                  {image}
                </button>
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-1.5">
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => {
                pause();
                scrollToSlide(trackRef.current, i);
              }}
              aria-label={`Show offer ${i + 1}`}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${i === index ? 'w-5 bg-brand-600' : 'w-1.5 bg-stone-300'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
