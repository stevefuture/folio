import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSwipeable } from 'react-swipeable';
import { motion, AnimatePresence } from 'framer-motion';
import { OptimizedImage } from './OptimizedImage';
import { CarouselControls } from './CarouselControls';
import { CarouselIndicators } from './CarouselIndicators';

interface CarouselItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  imagePath: string;
  mobileImagePath?: string;
  linkUrl?: string;
  buttonText?: string;
  textPosition?: 'center-left' | 'center-right' | 'center' | 'bottom-left' | 'bottom-right';
  textColor?: string;
  overlayOpacity?: number;
}

interface ImageCarouselProps {
  items: CarouselItem[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showControls?: boolean;
  showIndicators?: boolean;
  className?: string;
  onSlideChange?: (index: number) => void;
  onItemClick?: (item: CarouselItem) => void;
}

export const ImageCarousel: React.FC<ImageCarouselProps> = ({
  items,
  autoPlay = true,
  autoPlayInterval = 5000,
  showControls = true,
  showIndicators = true,
  className = '',
  onSlideChange,
  onItemClick
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoaded, setIsLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Set<number>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout>();
  const carouselRef = useRef<HTMLDivElement>(null);

  // Preload strategy: current + next 2 images
  const preloadImages = useCallback((startIndex: number) => {
    const imagesToPreload = [
      startIndex,
      (startIndex + 1) % items.length,
      (startIndex + 2) % items.length
    ];

    imagesToPreload.forEach(index => {
      if (!preloadedImages.has(index)) {
        const item = items[index];
        if (item) {
          // Preload both desktop and mobile versions
          const img1 = new Image();
          img1.src = getOptimizedImageUrl(item.imagePath, { w: 1920, f: 'webp', auto: true });
          
          if (item.mobileImagePath) {
            const img2 = new Image();
            img2.src = getOptimizedImageUrl(item.mobileImagePath, { w: 768, f: 'webp', auto: true });
          }
          
          setPreloadedImages(prev => new Set(prev).add(index));
        }
      }
    });
  }, [items, preloadedImages]);

  // Auto-play functionality
  useEffect(() => {
    if (isPlaying && items.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % items.length);
      }, autoPlayInterval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, items.length, autoPlayInterval]);

  // Preload images when index changes
  useEffect(() => {
    preloadImages(currentIndex);
  }, [currentIndex, preloadImages]);

  // Initial load
  useEffect(() => {
    if (items.length > 0) {
      preloadImages(0);
      setIsLoaded(true);
    }
  }, [items, preloadImages]);

  // Slide change callback
  useEffect(() => {
    onSlideChange?.(currentIndex);
  }, [currentIndex, onSlideChange]);

  // Navigation functions
  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsPlaying(false);
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + items.length) % items.length);
    setIsPlaying(false);
  }, [items.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % items.length);
    setIsPlaying(false);
  }, [items.length]);

  // Touch/swipe handlers
  const swipeHandlers = useSwipeable({
    onSwipedLeft: goToNext,
    onSwipedRight: goToPrevious,
    trackMouse: true,
    trackTouch: true,
    preventScrollOnSwipe: true,
    delta: 50
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!carouselRef.current?.contains(document.activeElement)) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToNext();
          break;
        case ' ':
        case 'Enter':
          event.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'Home':
          event.preventDefault();
          goToSlide(0);
          break;
        case 'End':
          event.preventDefault();
          goToSlide(items.length - 1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext, goToSlide, items.length]);

  // Pause on hover/focus
  const handleMouseEnter = () => setIsPlaying(false);
  const handleMouseLeave = () => setIsPlaying(autoPlay);
  const handleFocus = () => setIsPlaying(false);
  const handleBlur = () => setIsPlaying(autoPlay);

  if (!isLoaded || items.length === 0) {
    return (
      <div className={`carousel-loading ${className}`}>
        <div className="loading-spinner" aria-label="Loading carousel" />
      </div>
    );
  }

  const currentItem = items[currentIndex];

  return (
    <section
      ref={carouselRef}
      className={`image-carousel ${className}`}
      {...swipeHandlers}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-label="Image carousel"
      aria-live="polite"
      role="region"
    >
      {/* Main carousel container */}
      <div className="carousel-container">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            className="carousel-slide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            {/* Background image */}
            <OptimizedImage
              src={currentItem.imagePath}
              mobileSrc={currentItem.mobileImagePath}
              alt={currentItem.title}
              priority={currentIndex === 0}
              fill
              className="carousel-image"
              sizes="100vw"
              quality={85}
            />

            {/* Overlay */}
            <div 
              className="carousel-overlay"
              style={{ 
                backgroundColor: `rgba(0, 0, 0, ${currentItem.overlayOpacity || 0.3})` 
              }}
            />

            {/* Content */}
            <div 
              className={`carousel-content ${currentItem.textPosition || 'center-left'}`}
              style={{ color: currentItem.textColor || '#ffffff' }}
            >
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="carousel-text"
              >
                <h1 className="carousel-title">{currentItem.title}</h1>
                {currentItem.subtitle && (
                  <h2 className="carousel-subtitle">{currentItem.subtitle}</h2>
                )}
                {currentItem.description && (
                  <p className="carousel-description">{currentItem.description}</p>
                )}
                {currentItem.linkUrl && (
                  <button
                    className="carousel-cta"
                    onClick={() => onItemClick?.(currentItem)}
                    aria-label={`${currentItem.buttonText || 'Learn more'} about ${currentItem.title}`}
                  >
                    {currentItem.buttonText || 'Learn More'}
                  </button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Controls */}
        {showControls && items.length > 1 && (
          <CarouselControls
            onPrevious={goToPrevious}
            onNext={goToNext}
            onPlayPause={() => setIsPlaying(prev => !prev)}
            isPlaying={isPlaying}
            currentIndex={currentIndex}
            totalItems={items.length}
          />
        )}

        {/* Indicators */}
        {showIndicators && items.length > 1 && (
          <CarouselIndicators
            items={items}
            currentIndex={currentIndex}
            onIndicatorClick={goToSlide}
          />
        )}
      </div>

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Slide {currentIndex + 1} of {items.length}: {currentItem.title}
        {currentItem.subtitle && `, ${currentItem.subtitle}`}
      </div>
    </section>
  );
};

// Helper function for AWS image optimization
function getOptimizedImageUrl(
  imagePath: string, 
  options: { w?: number; h?: number; f?: string; q?: number; auto?: boolean }
): string {
  const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_DOMAIN || '';
  const params = new URLSearchParams();
  
  if (options.w) params.set('w', options.w.toString());
  if (options.h) params.set('h', options.h.toString());
  if (options.f) params.set('f', options.f);
  if (options.q) params.set('q', options.q.toString());
  if (options.auto) params.set('auto', 'true');
  
  return `${imageBaseUrl}/${imagePath}?${params.toString()}`;
}
