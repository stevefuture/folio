// Accessibility utility functions and helpers

// Check if user prefers reduced motion
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Check if user prefers high contrast
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
}

// Announce content to screen readers
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  if (typeof window === 'undefined') return;
  
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

// Focus management for modals and dynamic content
export class FocusManager {
  private previousFocus: HTMLElement | null = null;
  private focusableElements: HTMLElement[] = [];
  
  // Trap focus within a container
  trapFocus(container: HTMLElement): void {
    this.previousFocus = document.activeElement as HTMLElement;
    this.focusableElements = this.getFocusableElements(container);
    
    if (this.focusableElements.length > 0) {
      this.focusableElements[0].focus();
    }
    
    container.addEventListener('keydown', this.handleKeyDown.bind(this));
  }
  
  // Release focus trap and restore previous focus
  releaseFocus(container: HTMLElement): void {
    container.removeEventListener('keydown', this.handleKeyDown.bind(this));
    
    if (this.previousFocus) {
      this.previousFocus.focus();
    }
  }
  
  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');
    
    return Array.from(container.querySelectorAll(focusableSelectors));
  }
  
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    
    const firstElement = this.focusableElements[0];
    const lastElement = this.focusableElements[this.focusableElements.length - 1];
    
    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
}

// Keyboard navigation helper
export class KeyboardNavigation {
  static handleArrowNavigation(
    event: KeyboardEvent,
    items: HTMLElement[],
    currentIndex: number,
    onNavigate: (newIndex: number) => void
  ): void {
    let newIndex = currentIndex;
    
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = items.length - 1;
        break;
      default:
        return;
    }
    
    onNavigate(newIndex);
    items[newIndex]?.focus();
  }
}

// Color contrast checker
export function checkColorContrast(foreground: string, background: string): {
  ratio: number;
  wcagAA: boolean;
  wcagAAA: boolean;
} {
  const getLuminance = (color: string): number => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    // Calculate relative luminance
    const sRGB = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  };
  
  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  
  return {
    ratio: Math.round(ratio * 100) / 100,
    wcagAA: ratio >= 4.5,
    wcagAAA: ratio >= 7
  };
}

// Touch target size checker
export function checkTouchTargetSize(element: HTMLElement): {
  width: number;
  height: number;
  meetsWCAG: boolean;
} {
  const rect = element.getBoundingClientRect();
  const minSize = 44; // WCAG minimum touch target size
  
  return {
    width: rect.width,
    height: rect.height,
    meetsWCAG: rect.width >= minSize && rect.height >= minSize
  };
}

// Alt text quality checker
export function checkAltTextQuality(altText: string, imageSrc: string): {
  score: number;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  // Check for empty alt text
  if (!altText.trim()) {
    issues.push('Alt text is empty');
    score -= 50;
  }
  
  // Check for redundant phrases
  const redundantPhrases = ['image of', 'picture of', 'photo of', 'graphic of'];
  if (redundantPhrases.some(phrase => altText.toLowerCase().includes(phrase))) {
    issues.push('Contains redundant phrases');
    suggestions.push('Remove phrases like "image of" or "picture of"');
    score -= 10;
  }
  
  // Check for filename in alt text
  const filename = imageSrc.split('/').pop()?.split('.')[0];
  if (filename && altText.toLowerCase().includes(filename.toLowerCase())) {
    issues.push('Contains filename');
    suggestions.push('Replace filename with descriptive text');
    score -= 20;
  }
  
  // Check length
  if (altText.length > 125) {
    issues.push('Alt text is too long');
    suggestions.push('Keep alt text under 125 characters');
    score -= 10;
  }
  
  if (altText.length < 10 && altText.trim()) {
    issues.push('Alt text may be too brief');
    suggestions.push('Provide more descriptive alt text');
    score -= 15;
  }
  
  return {
    score: Math.max(0, score),
    issues,
    suggestions
  };
}

// ARIA label generator for common patterns
export const AriaLabels = {
  carousel: {
    region: (title: string) => `${title} carousel`,
    slide: (current: number, total: number) => `Slide ${current} of ${total}`,
    playButton: (isPlaying: boolean) => isPlaying ? 'Pause slideshow' : 'Play slideshow',
    previousButton: 'Previous slide',
    nextButton: 'Next slide',
    indicator: (index: number) => `Go to slide ${index + 1}`
  },
  
  gallery: {
    grid: (title: string, count: number) => `${title} gallery with ${count} images`,
    image: (title: string, index: number, total: number) => `${title}, image ${index + 1} of ${total}`,
    lightbox: (title: string) => `${title} - Full size view`,
    closeButton: 'Close image viewer'
  },
  
  form: {
    required: 'required field',
    optional: 'optional field',
    error: (fieldName: string) => `Error in ${fieldName} field`,
    success: 'Form submitted successfully'
  },
  
  navigation: {
    breadcrumb: 'Breadcrumb navigation',
    pagination: 'Pagination navigation',
    skipLink: 'Skip to main content'
  }
};

// Accessibility testing helper
export class AccessibilityTester {
  static async runBasicChecks(container: HTMLElement = document.body): Promise<{
    issues: Array<{
      type: string;
      element: HTMLElement;
      message: string;
      severity: 'error' | 'warning' | 'info';
    }>;
    score: number;
  }> {
    const issues: Array<{
      type: string;
      element: HTMLElement;
      message: string;
      severity: 'error' | 'warning' | 'info';
    }> = [];
    
    // Check for images without alt text
    const images = container.querySelectorAll('img');
    images.forEach(img => {
      if (!img.hasAttribute('alt')) {
        issues.push({
          type: 'missing-alt',
          element: img,
          message: 'Image missing alt attribute',
          severity: 'error'
        });
      }
    });
    
    // Check for buttons without accessible names
    const buttons = container.querySelectorAll('button');
    buttons.forEach(button => {
      const hasText = button.textContent?.trim();
      const hasAriaLabel = button.hasAttribute('aria-label');
      const hasAriaLabelledBy = button.hasAttribute('aria-labelledby');
      
      if (!hasText && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push({
          type: 'missing-button-name',
          element: button,
          message: 'Button missing accessible name',
          severity: 'error'
        });
      }
    });
    
    // Check for form inputs without labels
    const inputs = container.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      const hasLabel = container.querySelector(`label[for="${input.id}"]`);
      const hasAriaLabel = input.hasAttribute('aria-label');
      const hasAriaLabelledBy = input.hasAttribute('aria-labelledby');
      
      if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push({
          type: 'missing-form-label',
          element: input,
          message: 'Form control missing label',
          severity: 'error'
        });
      }
    });
    
    // Calculate score
    const totalElements = images.length + buttons.length + inputs.length;
    const errorCount = issues.filter(issue => issue.severity === 'error').length;
    const score = totalElements > 0 ? Math.max(0, 100 - (errorCount / totalElements) * 100) : 100;
    
    return { issues, score };
  }
}
