"use client";

import { useState, useEffect } from "react";

/**
 * Apple-style scroll-to-top button.
 * Appears after scrolling 400px, uses brand color,
 * smooth fade + scale animation.
 */
export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollUp() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      onClick={scrollUp}
      aria-label="Нагору"
      className={`
        fixed bottom-[calc(140px+env(safe-area-inset-bottom))] sm:bottom-24 right-4 z-40
        w-11 h-11 rounded-full
        bg-brand-600 text-white
        shadow-lg shadow-brand-600/25
        flex items-center justify-center
        cursor-pointer
        transition-all duration-300 ease-out
        hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/30
        active:scale-90
        ${visible
          ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
          : "opacity-0 translate-y-3 scale-75 pointer-events-none"
        }
      `}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={2.5}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
