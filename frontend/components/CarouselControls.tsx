import React from 'react';

interface CarouselControlsProps {
  onPrevious: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  isPlaying: boolean;
  currentIndex: number;
  totalItems: number;
}

export const CarouselControls: React.FC<CarouselControlsProps> = ({
  onPrevious,
  onNext,
  onPlayPause,
  isPlaying,
  currentIndex,
  totalItems
}) => {
  return (
    <div className="carousel-controls" role="group" aria-label="Carousel controls">
      {/* Previous button */}
      <button
        className="carousel-control carousel-control--prev"
        onClick={onPrevious}
        aria-label={`Go to previous slide. Currently on slide ${currentIndex + 1} of ${totalItems}`}
        type="button"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15,18 9,12 15,6" />
        </svg>
        <span className="sr-only">Previous</span>
      </button>

      {/* Play/Pause button */}
      <button
        className="carousel-control carousel-control--play-pause"
        onClick={onPlayPause}
        aria-label={isPlaying ? 'Pause carousel' : 'Play carousel'}
        type="button"
      >
        {isPlaying ? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
        <span className="sr-only">{isPlaying ? 'Pause' : 'Play'}</span>
      </button>

      {/* Next button */}
      <button
        className="carousel-control carousel-control--next"
        onClick={onNext}
        aria-label={`Go to next slide. Currently on slide ${currentIndex + 1} of ${totalItems}`}
        type="button"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9,18 15,12 9,6" />
        </svg>
        <span className="sr-only">Next</span>
      </button>
    </div>
  );
};
