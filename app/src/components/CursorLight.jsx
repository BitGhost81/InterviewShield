import React, { useEffect, useRef } from 'react';

export function CursorLight() {
  const lightRef = useRef(null);

  useEffect(() => {
    // Check for reduced motion and coarse pointer (touch devices)
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;

    if (prefersReducedMotion || isCoarse) {
      return;
    }

    const light = lightRef.current;
    if (!light) return;

    const handlePointerMove = (e) => {
      light.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      light.style.opacity = '1';
    };

    const handlePointerLeave = () => {
      light.style.opacity = '0';
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, []);

  return (
    <div
      ref={lightRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '380px',
        height: '380px',
        pointerEvents: 'none',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(130, 246, 211, 0.08) 0%, transparent 68%)',
        mixBlendMode: 'screen',
        opacity: 0,
        transition: 'opacity 0.3s ease',
        zIndex: 9999,
        willChange: 'transform',
      }}
    />
  );
}

export default CursorLight;
