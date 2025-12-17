import { useState, useEffect, useCallback } from 'react';

interface CarouselItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  imagePath: string;
  mobileImagePath?: string;
  linkUrl?: string;
  buttonText?: string;
  textPosition?: string;
  textColor?: string;
  overlayOpacity?: number;
  position: number;
  status: string;
  isVisible: boolean;
}

interface UseCarouselOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  onItemView?: (itemId: string) => void;
  onItemClick?: (itemId: string) => void;
}

export const useCarousel = (options: UseCarouselOptions = {}) => {
  const [items, setItems] = useState<CarouselItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const {
    autoRefresh = false,
    refreshInterval = 300000, // 5 minutes
    onItemView,
    onItemClick
  } = options;

  // Fetch carousel items from API
  const fetchCarouselItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/carousel`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add cache control for performance
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch carousel items: ${response.status}`);
      }

      const data = await response.json();
      
      // Filter and sort active, visible items
      const activeItems = data
        .filter((item: CarouselItem) => item.status === 'active' && item.isVisible)
        .sort((a: CarouselItem, b: CarouselItem) => a.position - b.position);

      setItems(activeItems);
      
      // Reset current index if it's out of bounds
      if (currentIndex >= activeItems.length) {
        setCurrentIndex(0);
      }

    } catch (err) {
      console.error('Error fetching carousel items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load carousel');
    } finally {
      setLoading(false);
    }
  }, [currentIndex]);

  // Track item view
  const trackItemView = useCallback(async (itemId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      await fetch(`${apiUrl}/api/carousel/${itemId}/view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      onItemView?.(itemId);
    } catch (err) {
      console.error('Error tracking item view:', err);
    }
  }, [onItemView]);

  // Track item click
  const trackItemClick = useCallback(async (itemId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      await fetch(`${apiUrl}/api/carousel/${itemId}/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      onItemClick?.(itemId);
    } catch (err) {
      console.error('Error tracking item click:', err);
    }
  }, [onItemClick]);

  // Handle slide change with analytics
  const handleSlideChange = useCallback((index: number) => {
    setCurrentIndex(index);
    
    if (items[index]) {
      trackItemView(items[index].id);
    }
  }, [items, trackItemView]);

  // Handle item click with analytics
  const handleItemClick = useCallback((item: CarouselItem) => {
    trackItemClick(item.id);
    
    // Navigate to link if provided
    if (item.linkUrl) {
      if (item.linkUrl.startsWith('http')) {
        // External link
        window.open(item.linkUrl, '_blank', 'noopener,noreferrer');
      } else {
        // Internal link
        window.location.href = item.linkUrl;
      }
    }
  }, [trackItemClick]);

  // Initial fetch
  useEffect(() => {
    fetchCarouselItems();
  }, [fetchCarouselItems]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchCarouselItems, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, fetchCarouselItems]);

  // Track initial view
  useEffect(() => {
    if (items.length > 0 && items[currentIndex]) {
      trackItemView(items[currentIndex].id);
    }
  }, [items, currentIndex, trackItemView]);

  return {
    items,
    loading,
    error,
    currentIndex,
    refetch: fetchCarouselItems,
    onSlideChange: handleSlideChange,
    onItemClick: handleItemClick
  };
};
