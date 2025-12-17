import React from 'react';

interface CarouselItem {
  id: string;
  title: string;
}

interface CarouselIndicatorsProps {
  items: CarouselItem[];
  currentIndex: number;
  onIndicatorClick: (index: number) => void;
}

export const CarouselIndicators: React.FC<CarouselIndicatorsProps> = ({
  items,
  currentIndex,
  onIndicatorClick
}) => {
  return (
    <div className="carousel-indicators" role="tablist" aria-label="Carousel slides">
      {items.map((item, index) => (
        <button
          key={item.id}
          className={`carousel-indicator ${index === currentIndex ? 'active' : ''}`}
          onClick={() => onIndicatorClick(index)}
          role="tab"
          aria-selected={index === currentIndex}
          aria-controls={`carousel-slide-${index}`}
          aria-label={`Go to slide ${index + 1}: ${item.title}`}
          type="button"
        >
          <span className="indicator-dot" />
          <span className="sr-only">
            Slide {index + 1} of {items.length}: {item.title}
          </span>
        </button>
      ))}
    </div>
  );
};
