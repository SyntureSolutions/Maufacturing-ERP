'use client';

import React, { useEffect, useState } from 'react';

export default function HeroParallaxGlow() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize between -1 and 1
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      
      animationFrameId = requestAnimationFrame(() => {
        setMousePos({ x, y });
      });
    };

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Very gentle drift: +/- 25px max based on mouse, and slow 0.15x scroll parallax
  const translateX = mousePos.x * 24;
  const translateY = mousePos.y * 18 - scrollY * 0.12;

  return (
    <div
      className="absolute top-0 left-1/2 -translate-x-1/2 w-[850px] h-[450px] pointer-events-none -z-10 transition-transform duration-700 ease-out"
      style={{
        transform: `translate(calc(-50% + ${translateX}px), ${translateY}px)`
      }}
    >
      {/* Primary Warm Amber Ambient Glow */}
      <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[650px] h-[320px] bg-amber-500/10 blur-[140px] rounded-full" />
      {/* Secondary Soft Slate Blue Highlight Glow */}
      <div className="absolute top-10 left-1/3 w-[450px] h-[260px] bg-blue-500/5 blur-[120px] rounded-full" />
    </div>
  );
}
