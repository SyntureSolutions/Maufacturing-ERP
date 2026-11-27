'use client';

import React, { useState, useEffect } from 'react';

interface RotatingWordsProps {
  words: string[];
  className?: string;
  interval?: number;
}

export default function RotatingWords({ words, className = '', interval = 2800 }: RotatingWordsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % words.length);
        setIsAnimating(false);
      }, 400);
    }, interval);

    return () => clearInterval(timer);
  }, [words.length, interval]);

  return (
    <span className={`inline-block relative overflow-hidden ${className}`}>
      <span
        className={`inline-block transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isAnimating
            ? 'opacity-0 -translate-y-[110%]'
            : 'opacity-100 translate-y-0'
        }`}
      >
        {words[currentIndex]}
      </span>
    </span>
  );
}
