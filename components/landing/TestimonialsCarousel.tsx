'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Star, Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Rajesh Mehta',
    role: 'COO, Apex Auto Components',
    emoji: '🏭',
    avatar: 'RM',
    rating: 5,
    text: 'Prodexa ERP reduced our batch spoilage to near-zero. The FEFO engine alone saved us ₹18 Lakhs in the first quarter. The real-time shopfloor dashboard is a game changer.',
    metric: '₹18L Saved in Q1'
  },
  {
    name: 'Priya Sharma',
    role: 'Plant Director, FreshPack Foods',
    emoji: '🍜',
    avatar: 'PS',
    rating: 5,
    text: 'We switched from manual Excel tracking to Prodexa and cut our dispatch planning time by 65%. The automated E-Way bill generation is incredibly smooth and reliable.',
    metric: '65% Faster Dispatch'
  },
  {
    name: 'Vikram Patel',
    role: 'MD, Gujarat Steel Works',
    emoji: '⚙️',
    avatar: 'VP',
    rating: 5,
    text: 'The MRP engine handles our 5-tier BOM explosion perfectly. What used to take our team 2 days of calculations now runs automatically within minutes. Outstanding product.',
    metric: '2 Days → 5 Minutes'
  },
  {
    name: 'Anita Kulkarni',
    role: 'Finance Head, Bharat Polymers',
    emoji: '📊',
    avatar: 'AK',
    rating: 5,
    text: 'GST compliance was our biggest headache. Prodexa auto-generates GSTR-1 JSON, reconciles with 2B data, and creates tax invoices in one click. Our audits are now stress-free.',
    metric: '100% GST Compliant'
  }
];

export default function TestimonialsCarousel() {
  const [current, setCurrent] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');

  const goToNext = useCallback(() => {
    setSlideDirection('right');
    setCurrent((prev) => (prev + 1) % testimonials.length);
  }, []);

  const goToPrev = useCallback(() => {
    setSlideDirection('left');
    setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(goToNext, 5000);
    return () => clearInterval(timer);
  }, [isAutoPlaying, goToNext]);

  const t = testimonials[current];

  return (
    <section className="py-24 bg-[#F5EDE3] border-t border-[#E8DDD0] relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-6 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-14">
          <span className="text-xs font-black text-amber-600 uppercase tracking-widest block mb-2">
            💬 Customer Success Stories
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#1E3A8A] tracking-tight">
            Trusted by <span className="text-amber-500">340+</span> Manufacturers
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto text-base mt-3">
            Real results from real factories across India.
          </p>
        </div>

        {/* Carousel Card */}
        <div
          className="relative bg-white rounded-3xl border-2 border-[#1E293B]/15 shadow-2xl p-8 md:p-12 overflow-hidden"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
        >
          {/* Decorative quote */}
          <Quote className="absolute top-6 right-8 w-16 h-16 text-amber-500/10 rotate-180" />

          {/* Slide content */}
          <div
            key={current}
            className={slideDirection === 'right' ? 'slide-in-right' : 'slide-in-left'}
          >
            {/* Stars */}
            <div className="flex items-center gap-1 mb-4">
              {Array.from({ length: t.rating }).map((_, i) => (
                <Star key={i} className="w-4 h-4 text-amber-500 fill-amber-500" />
              ))}
            </div>

            {/* Quote text */}
            <blockquote className="text-lg sm:text-xl font-medium text-slate-800 leading-relaxed mb-8 max-w-3xl">
              "{t.text}"
            </blockquote>

            {/* Author info row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-2xl bg-[#1E293B] text-amber-400 flex items-center justify-center font-black text-sm border border-slate-700 shadow-md shrink-0">
                  {t.avatar}
                </div>
                <div>
                  <p className="font-extrabold text-[#1E293B] text-sm flex items-center gap-2">
                    {t.name}
                    <span className="text-lg">{t.emoji}</span>
                  </p>
                  <p className="text-xs text-slate-500 font-medium">{t.role}</p>
                </div>
              </div>

              {/* Result badge */}
              <span className="px-4 py-2 rounded-full bg-emerald-100 border border-emerald-400 text-emerald-800 text-xs font-extrabold shadow-xs">
                🎯 {t.metric}
              </span>
            </div>
          </div>

          {/* Navigation arrows */}
          <div className="flex items-center gap-2 mt-8 justify-center">
            <button
              onClick={goToPrev}
              className="p-2.5 rounded-xl bg-[#1E293B] text-white hover:bg-slate-800 transition-colors shadow-md cursor-pointer"
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Dots indicator */}
            <div className="flex items-center gap-2 px-4">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSlideDirection(i > current ? 'right' : 'left');
                    setCurrent(i);
                  }}
                  className={`transition-all duration-300 rounded-full cursor-pointer ${
                    i === current
                      ? 'w-8 h-2.5 bg-amber-500'
                      : 'w-2.5 h-2.5 bg-slate-300 hover:bg-slate-400'
                  }`}
                  aria-label={`Go to testimonial ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={goToNext}
              className="p-2.5 rounded-xl bg-[#1E293B] text-white hover:bg-slate-800 transition-colors shadow-md cursor-pointer"
              aria-label="Next testimonial"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
