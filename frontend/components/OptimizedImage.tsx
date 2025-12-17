import React, { useState, useEffect } from 'react';
import Image from 'next/image';

interface OptimizedImageProps {
  src: string;
  mobileSrc?: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  className?: string;
  sizes?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  mobileSrc,
  alt,
  width,
  height,
  fill = false,
  priority = false,
  quality = 85,
  className = '',
  sizes = '100vw',
  onLoad,
  onError
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_DOMAIN || '';

  // Generate responsive image URLs
  const generateImageUrl = (imagePath: string, width: number, format?: string) => {
    const params = new URLSearchParams({
      w: width.toString(),
      q: quality.toString(),
      auto: 'true'
    });
    
    if (format) {
      params.set('f', format);
    }
    
    return `${imageBaseUrl}/${imagePath}?${params.toString()}`;
  };

  // Generate srcSet for responsive images
  const generateSrcSet = (imagePath: string) => {
    const breakpoints = [640, 768, 1024, 1280, 1536, 1920];
    return breakpoints
      .map(bp => `${generateImageUrl(imagePath, bp)} ${bp}w`)
      .join(', ');
  };

  // Handle image load
  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  // Handle image error
  const handleError = () => {
    setImageError(true);
    onError?.();
  };

  // Fallback image
  if (imageError) {
    return (
      <div className={`image-error ${className}`}>
        <div className="error-placeholder">
          <span>Image unavailable</span>
        </div>
      </div>
    );
  }

  // For mobile-specific images
  if (mobileSrc) {
    return (
      <picture className={className}>
        {/* Desktop image */}
        <source
          media="(min-width: 768px)"
          srcSet={generateSrcSet(src)}
          sizes={sizes}
        />
        
        {/* Mobile image */}
        <source
          media="(max-width: 767px)"
          srcSet={generateSrcSet(mobileSrc)}
          sizes="100vw"
        />
        
        {/* Fallback */}
        <Image
          src={generateImageUrl(src, 1920)}
          alt={alt}
          width={width}
          height={height}
          fill={fill}
          priority={priority}
          quality={quality}
          className={`optimized-image ${!isLoaded ? 'loading' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
          sizes={sizes}
        />
      </picture>
    );
  }

  // Standard responsive image
  return (
    <Image
      src={generateImageUrl(src, width || 1920)}
      srcSet={generateSrcSet(src)}
      alt={alt}
      width={width}
      height={height}
      fill={fill}
      priority={priority}
      quality={quality}
      className={`optimized-image ${className} ${!isLoaded ? 'loading' : ''}`}
      onLoad={handleLoad}
      onError={handleError}
      sizes={sizes}
    />
  );
};
