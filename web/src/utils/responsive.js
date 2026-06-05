/**
 * Responsive breakpoints (D14).
 *   mobile  : < 768  (phones, portrait)
 *   tablet  : 768 - 1024 (tablets, small laptops)
 *   desktop : >= 1024 (PCs)
 */
export const BREAKPOINTS = Object.freeze({
  mobile: 768,
  tablet: 1024,
});

export const isMobile = () =>
  typeof window !== 'undefined' && window.innerWidth < BREAKPOINTS.mobile;

export const isTablet = () =>
  typeof window !== 'undefined' &&
  window.innerWidth >= BREAKPOINTS.mobile &&
  window.innerWidth < BREAKPOINTS.tablet;

export const isDesktop = () =>
  typeof window !== 'undefined' && window.innerWidth >= BREAKPOINTS.tablet;

/**
 * Reactive helper for components: returns a ref that tracks the current
 * breakpoint label. Updates on window resize.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';

export const useBreakpoint = () => {
  const bp = ref(detect());
  const update = () => {
    bp.value = detect();
  };
  onMounted(() => window.addEventListener('resize', update));
  onBeforeUnmount(() => window.removeEventListener('resize', update));
  return bp;
};

const detect = () => {
  if (isMobile()) return 'mobile';
  if (isTablet()) return 'tablet';
  return 'desktop';
};
