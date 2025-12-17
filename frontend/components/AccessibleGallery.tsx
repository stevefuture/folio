import React, { useState, useRef, useEffect } from 'react';
import { FocusManager, KeyboardNavigation, announceToScreenReader } from '../lib/accessibility';

interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  title: string;
  description?: string;
  width: number;
  height: number;
}

interface AccessibleGalleryProps {
  images: GalleryImage[];
  title: string;
  className?: string;
  onImageSelect?: (image: GalleryImage) => void;
}

export const AccessibleGallery: React.FC<AccessibleGalleryProps> = ({
  images,
  title,
  className = '',
  onImageSelect
}) => {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentLightboxIndex, setCurrentLightboxIndex] = useState(0);
  
  const galleryRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const focusManager = useRef(new FocusManager());
  
  // Handle keyboard navigation in gallery
  const handleGalleryKeyDown = (event: KeyboardEvent) => {
    if (!galleryRef.current) return;
    
    const imageElements = Array.from(
      galleryRef.current.querySelectorAll('[role="button"]')
    ) as HTMLElement[];
    
    KeyboardNavigation.handleArrowNavigation(
      event,
      imageElements,
      selectedIndex,
      (newIndex) => {
        setSelectedIndex(newIndex);
        announceToScreenReader(
          `Image ${newIndex + 1} of ${images.length}: ${images[newIndex].title}`
        );
      }
    );
    
    // Enter or Space to open lightbox
    if (event.key === 'Enter' || event.key === ' ') {
      if (selectedIndex >= 0) {
        event.preventDefault();
        openLightbox(selectedIndex);
      }
    }
  };
  
  // Open lightbox
  const openLightbox = (index: number) => {
    setCurrentLightboxIndex(index);
    setLightboxOpen(true);
    
    // Announce to screen readers
    announceToScreenReader(
      `Opened full-size view of ${images[index].title}. Use arrow keys to navigate, Escape to close.`,
      'assertive'
    );
    
    // Trap focus in lightbox
    setTimeout(() => {
      if (lightboxRef.current) {
        focusManager.current.trapFocus(lightboxRef.current);
      }
    }, 100);
  };
  
  // Close lightbox
  const closeLightbox = () => {
    setLightboxOpen(false);
    
    // Release focus trap
    if (lightboxRef.current) {
      focusManager.current.releaseFocus(lightboxRef.current);
    }
    
    announceToScreenReader('Closed full-size view');
  };
  
  // Handle lightbox keyboard navigation
  const handleLightboxKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeLightbox();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        navigateLightbox(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        navigateLightbox(1);
        break;
    }
  };
  
  // Navigate in lightbox
  const navigateLightbox = (direction: number) => {
    const newIndex = (currentLightboxIndex + direction + images.length) % images.length;
    setCurrentLightboxIndex(newIndex);
    
    announceToScreenReader(
      `Image ${newIndex + 1} of ${images.length}: ${images[newIndex].title}`
    );
  };
  
  // Set up event listeners
  useEffect(() => {
    const gallery = galleryRef.current;
    const lightbox = lightboxRef.current;
    
    if (gallery) {
      gallery.addEventListener('keydown', handleGalleryKeyDown);
    }
    
    if (lightbox && lightboxOpen) {
      lightbox.addEventListener('keydown', handleLightboxKeyDown);
    }
    
    return () => {
      if (gallery) {
        gallery.removeEventListener('keydown', handleGalleryKeyDown);
      }
      if (lightbox) {
        lightbox.removeEventListener('keydown', handleLightboxKeyDown);
      }
    };
  }, [selectedIndex, lightboxOpen, currentLightboxIndex]);
  
  const currentImage = images[currentLightboxIndex];
  
  return (
    <>
      {/* Gallery */}
      <section
        ref={galleryRef}
        className={`accessible-gallery ${className}`}
        aria-labelledby="gallery-title"
      >
        <h2 id="gallery-title">{title}</h2>
        <p className="gallery-description">
          A collection of {images.length} photographs. 
          Use arrow keys to navigate, Enter to view full size.
        </p>
        
        <div
          className="gallery-grid"
          role="grid"
          aria-label={`${title} with ${images.length} images`}
        >
          {images.map((image, index) => (
            <div
              key={image.id}
              role="gridcell"
              className="gallery-item"
            >
              <button
                className={`gallery-image-button ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedIndex(index);
                  onImageSelect?.(image);
                  openLightbox(index);
                }}
                onFocus={() => setSelectedIndex(index)}
                aria-label={`View full size: ${image.title}. Image ${index + 1} of ${images.length}`}
                aria-describedby={`image-desc-${image.id}`}
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                />
                <div className="image-overlay">
                  <span className="sr-only">Click to view full size</span>
                </div>
              </button>
              
              <div className="image-info">
                <h3 className="image-title">{image.title}</h3>
                {image.description && (
                  <p id={`image-desc-${image.id}`} className="image-description">
                    {image.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      
      {/* Lightbox Modal */}
      {lightboxOpen && currentImage && (
        <div
          className="lightbox-overlay"
          onClick={closeLightbox}
          aria-hidden="true"
        >
          <div
            ref={lightboxRef}
            className="lightbox"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lightbox-title"
            aria-describedby="lightbox-description"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="lightbox-header">
              <h2 id="lightbox-title" className="lightbox-title">
                {currentImage.title}
              </h2>
              <button
                className="lightbox-close"
                onClick={closeLightbox}
                aria-label="Close full-size view"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            
            {/* Lightbox Content */}
            <div className="lightbox-content">
              <img
                src={currentImage.src}
                alt={currentImage.alt}
                className="lightbox-image"
              />
              
              {currentImage.description && (
                <p id="lightbox-description" className="lightbox-description">
                  {currentImage.description}
                </p>
              )}
            </div>
            
            {/* Lightbox Navigation */}
            <div className="lightbox-nav">
              <button
                className="lightbox-nav-button lightbox-prev"
                onClick={() => navigateLightbox(-1)}
                aria-label={`Previous image: ${images[(currentLightboxIndex - 1 + images.length) % images.length].title}`}
                disabled={images.length <= 1}
              >
                <span aria-hidden="true">‹</span>
              </button>
              
              <span className="lightbox-counter" aria-live="polite">
                Image {currentLightboxIndex + 1} of {images.length}
              </span>
              
              <button
                className="lightbox-nav-button lightbox-next"
                onClick={() => navigateLightbox(1)}
                aria-label={`Next image: ${images[(currentLightboxIndex + 1) % images.length].title}`}
                disabled={images.length <= 1}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
            
            {/* Instructions */}
            <div className="lightbox-instructions">
              <p className="sr-only">
                Use left and right arrow keys to navigate between images. 
                Press Escape to close the full-size view.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
