import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxImage {
  src: string;
  alt: string;
}

interface LightboxState {
  isOpen: boolean;
  images: LightboxImage[];
  index: number;
  open: (images: LightboxImage[], index: number) => void;
  close: () => void;
}

export const useLightboxStore = create<LightboxState>((set) => ({
  isOpen: false,
  images: [],
  index: 0,
  open: (images, index) => set({ isOpen: true, images, index }),
  close: () => set({ isOpen: false, images: [], index: 0 }),
}));

export function ImageLightbox() {
  const { isOpen, images, index, close } = useLightboxStore();
  const [currentIndex, setCurrentIndex] = useState(index);

  useEffect(() => {
    setCurrentIndex(index);
  }, [index]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close, handlePrev, handleNext]);

  if (!isOpen || images.length === 0) return null;

  const image = images[currentIndex];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-in fade-in duration-150"
      onClick={close}
    >
      <button
        onClick={close}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <img
        src={image.src}
        alt={image.alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>,
    document.body
  );
}
