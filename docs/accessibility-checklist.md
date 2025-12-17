# WCAG 2.1 AA Accessibility Checklist - Photography Portfolio

## 1. Perceivable

### 1.1 Text Alternatives (Level A)

#### Images & Photography
- [ ] **All images have meaningful alt text** describing content and context
- [ ] **Decorative images use empty alt=""** or are implemented as CSS backgrounds
- [ ] **Complex images** (charts, diagrams) have detailed descriptions via `aria-describedby`
- [ ] **Image galleries** provide alt text for each image describing the photograph
- [ ] **Carousel images** have descriptive alt text, not just "slide 1", "slide 2"

```html
<!-- ✅ Good -->
<img src="mountain-sunset.jpg" alt="Golden sunset over snow-capped mountain peaks in the Rocky Mountains" />

<!-- ❌ Bad -->
<img src="img001.jpg" alt="Image" />
<img src="decorative-border.jpg" alt="decorative border" /> <!-- Should be alt="" -->
```

#### Functional Images
- [ ] **Logo images** include company/site name in alt text
- [ ] **Icon buttons** have descriptive alt text or `aria-label`
- [ ] **Image links** describe the link destination, not the image

```html
<!-- ✅ Good -->
<button aria-label="Play slideshow">
  <img src="play-icon.svg" alt="" />
</button>

<a href="/contact">
  <img src="email-icon.svg" alt="Contact us" />
</a>
```

### 1.2 Time-based Media (Level A & AA)

#### Video Content
- [ ] **All videos have captions** for dialogue and important sounds
- [ ] **Audio descriptions** provided for visual content not described in audio
- [ ] **Auto-playing media** can be paused, stopped, or muted
- [ ] **Media controls** are keyboard accessible

#### Carousel/Slideshow
- [ ] **Auto-advancing carousels** have pause/play controls
- [ ] **Carousel timing** allows sufficient time to read content (minimum 5 seconds)
- [ ] **Motion can be disabled** via `prefers-reduced-motion`

```css
/* ✅ Respect motion preferences */
@media (prefers-reduced-motion: reduce) {
  .carousel {
    animation: none;
  }
  .carousel-slide {
    transition: none;
  }
}
```

### 1.3 Adaptable (Level A & AA)

#### Content Structure
- [ ] **Proper heading hierarchy** (h1 → h2 → h3, no skipping levels)
- [ ] **Semantic HTML elements** used correctly (`nav`, `main`, `section`, `article`)
- [ ] **Lists use proper markup** (`ul`, `ol`, `li`)
- [ ] **Tables have headers** and proper structure when used

```html
<!-- ✅ Good structure -->
<main>
  <h1>Photography Portfolio</h1>
  <section>
    <h2>Landscape Photography</h2>
    <h3>Mountain Series</h3>
  </section>
</main>
```

#### Responsive Design
- [ ] **Content reflows** properly at 320px width
- [ ] **Horizontal scrolling** not required (except for data tables)
- [ ] **Content readable** without horizontal scrolling at 400% zoom
- [ ] **Touch targets** minimum 44x44 pixels on mobile

### 1.4 Distinguishable (Level A & AA)

#### Color & Contrast
- [ ] **Text contrast ratio** minimum 4.5:1 for normal text
- [ ] **Large text contrast** minimum 3:1 (18pt+ or 14pt+ bold)
- [ ] **Non-text contrast** minimum 3:1 for UI components and graphics
- [ ] **Color not sole indicator** of information or actions
- [ ] **Focus indicators** have minimum 3:1 contrast ratio

```css
/* ✅ Good contrast examples */
.text-primary { color: #212529; } /* 16.75:1 on white */
.text-secondary { color: #6c757d; } /* 4.54:1 on white */
.button-primary { 
  background: #0d6efd; /* 4.52:1 on white text */
  border: 2px solid #0d6efd;
}
```

#### Visual Presentation
- [ ] **Text can be resized** to 200% without loss of functionality
- [ ] **Line height** minimum 1.5 times font size
- [ ] **Paragraph spacing** minimum 2 times font size
- [ ] **Letter spacing** minimum 0.12 times font size
- [ ] **Word spacing** minimum 0.16 times font size

```css
/* ✅ WCAG spacing requirements */
body {
  line-height: 1.5; /* Minimum 1.5x */
}
p {
  margin-bottom: 2em; /* Minimum 2x font size */
}
```

## 2. Operable

### 2.1 Keyboard Accessible (Level A)

#### Navigation
- [ ] **All interactive elements** accessible via keyboard
- [ ] **Logical tab order** follows visual layout
- [ ] **No keyboard traps** (users can navigate away from any element)
- [ ] **Skip links** provided to main content
- [ ] **Custom controls** have proper keyboard support

```html
<!-- ✅ Skip link -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<!-- ✅ Keyboard accessible carousel -->
<div class="carousel" role="region" aria-label="Featured photography">
  <button aria-label="Previous slide" onclick="previousSlide()">‹</button>
  <button aria-label="Next slide" onclick="nextSlide()">›</button>
</div>
```

#### Carousel Keyboard Support
- [ ] **Arrow keys** navigate between slides
- [ ] **Space/Enter** pause/play auto-advance
- [ ] **Home/End** go to first/last slide
- [ ] **Tab key** moves to carousel controls

### 2.2 Enough Time (Level A & AA)

#### Timing
- [ ] **No time limits** or users can extend/disable them
- [ ] **Auto-updating content** can be paused or controlled
- [ ] **Session timeouts** have warnings with option to extend
- [ ] **Moving content** can be paused, stopped, or hidden

#### Carousel Timing
- [ ] **Auto-advance** can be paused
- [ ] **Sufficient time** to read each slide (minimum 5 seconds)
- [ ] **Pause on hover/focus** implemented

### 2.3 Seizures and Physical Reactions (Level A & AA)

#### Flashing Content
- [ ] **No content flashes** more than 3 times per second
- [ ] **Large flashing areas** avoided
- [ ] **Animation can be disabled** via user preferences

### 2.4 Navigable (Level A & AA)

#### Navigation Structure
- [ ] **Page titles** are descriptive and unique
- [ ] **Link purpose** clear from link text or context
- [ ] **Multiple navigation methods** available (menu, search, sitemap)
- [ ] **Consistent navigation** across pages
- [ ] **Breadcrumbs** provided for deep navigation

```html
<!-- ✅ Descriptive page titles -->
<title>Mountain Landscapes - Photography Portfolio | John Doe</title>

<!-- ✅ Clear link text -->
<a href="/projects/landscapes">View Landscape Photography Collection</a>

<!-- ✅ Breadcrumbs -->
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/projects">Projects</a></li>
    <li aria-current="page">Mountain Landscapes</li>
  </ol>
</nav>
```

#### Focus Management
- [ ] **Visible focus indicators** on all interactive elements
- [ ] **Focus order** is logical and predictable
- [ ] **Focus not lost** during page updates
- [ ] **Modal dialogs** trap focus appropriately

```css
/* ✅ Visible focus indicators */
button:focus,
a:focus,
input:focus {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}

/* ✅ High contrast focus for better visibility */
@media (prefers-contrast: high) {
  button:focus {
    outline: 3px solid;
  }
}
```

### 2.5 Input Modalities (Level A & AA)

#### Pointer Gestures
- [ ] **Multi-point gestures** have single-point alternatives
- [ ] **Path-based gestures** have simple alternatives
- [ ] **Touch targets** minimum 44x44 pixels
- [ ] **Target spacing** minimum 8 pixels between targets

#### Motion Actuation
- [ ] **Device motion** not required for functionality
- [ ] **Motion-triggered functions** can be disabled
- [ ] **Alternative input methods** available

## 3. Understandable

### 3.1 Readable (Level A & AA)

#### Language
- [ ] **Page language** specified in HTML
- [ ] **Language changes** marked with `lang` attribute
- [ ] **Content written** at appropriate reading level

```html
<!-- ✅ Language specification -->
<html lang="en">
<p>Welcome to our <span lang="fr">galerie</span> of fine art photography.</p>
```

### 3.2 Predictable (Level A & AA)

#### Consistent Interface
- [ ] **Navigation consistent** across pages
- [ ] **Interactive elements** behave predictably
- [ ] **Context changes** don't occur on focus alone
- [ ] **Form submission** requires explicit user action

#### Gallery/Carousel Predictability
- [ ] **Controls work consistently** across all galleries
- [ ] **Navigation patterns** remain the same
- [ ] **Unexpected content changes** avoided

### 3.3 Input Assistance (Level A & AA)

#### Form Accessibility
- [ ] **Error identification** clear and specific
- [ ] **Labels associated** with form controls
- [ ] **Instructions provided** for required fields
- [ ] **Error suggestions** offered when possible
- [ ] **Error prevention** for important submissions

```html
<!-- ✅ Accessible contact form -->
<form>
  <label for="name">Name (required)</label>
  <input type="text" id="name" required aria-describedby="name-error">
  <div id="name-error" class="error" aria-live="polite"></div>
  
  <label for="email">Email Address (required)</label>
  <input type="email" id="email" required aria-describedby="email-help">
  <div id="email-help">We'll never share your email address</div>
  
  <fieldset>
    <legend>Inquiry Type</legend>
    <input type="radio" id="wedding" name="inquiry" value="wedding">
    <label for="wedding">Wedding Photography</label>
    <input type="radio" id="portrait" name="inquiry" value="portrait">
    <label for="portrait">Portrait Session</label>
  </fieldset>
</form>
```

## 4. Robust

### 4.1 Compatible (Level A & AA)

#### Code Quality
- [ ] **Valid HTML** markup
- [ ] **Proper ARIA** usage and syntax
- [ ] **Unique IDs** for all elements that need them
- [ ] **Assistive technology** compatibility tested

```html
<!-- ✅ Proper ARIA usage -->
<div role="tablist" aria-label="Photography categories">
  <button role="tab" aria-selected="true" aria-controls="landscapes">Landscapes</button>
  <button role="tab" aria-selected="false" aria-controls="portraits">Portraits</button>
</div>
<div role="tabpanel" id="landscapes" aria-labelledby="landscapes-tab">
  <!-- Landscape gallery content -->
</div>
```

## Photography-Specific Accessibility

### Image Galleries

#### Gallery Structure
- [ ] **Gallery has descriptive heading** and introduction
- [ ] **Image count** announced to screen readers
- [ ] **Grid/list view options** available
- [ ] **Keyboard navigation** between images
- [ ] **Image details** accessible (title, description, metadata)

```html
<!-- ✅ Accessible gallery -->
<section aria-labelledby="gallery-title">
  <h2 id="gallery-title">Mountain Landscapes Gallery</h2>
  <p>A collection of 24 photographs capturing the majesty of mountain landscapes.</p>
  
  <div class="gallery-grid" role="grid" aria-label="Photography gallery">
    <div role="gridcell">
      <img src="mountain1.jpg" alt="Snow-capped peak at sunrise with golden light">
      <div class="image-details">
        <h3>Alpine Dawn</h3>
        <p>Captured at Mount Rainier National Park, Washington</p>
      </div>
    </div>
  </div>
</section>
```

#### Lightbox/Modal
- [ ] **Focus trapped** within modal
- [ ] **Escape key** closes modal
- [ ] **Background content** hidden from screen readers
- [ ] **Modal title** announced
- [ ] **Navigation instructions** provided

```html
<!-- ✅ Accessible lightbox -->
<div class="lightbox" role="dialog" aria-labelledby="lightbox-title" aria-modal="true">
  <h2 id="lightbox-title">Alpine Dawn - Full Size View</h2>
  <img src="mountain1-full.jpg" alt="Snow-capped peak at sunrise with golden light">
  <button aria-label="Close lightbox">×</button>
  <button aria-label="Previous image">‹</button>
  <button aria-label="Next image">›</button>
  <p>Use arrow keys to navigate, Escape to close</p>
</div>
```

### Carousel Implementation

#### ARIA Structure
- [ ] **Carousel region** properly labeled
- [ ] **Live region** announces slide changes
- [ ] **Slide indicators** have proper roles
- [ ] **Current slide** clearly identified

```html
<!-- ✅ Accessible carousel -->
<section class="carousel" role="region" aria-label="Featured photography" aria-live="polite">
  <div class="carousel-slides">
    <div class="slide active" role="tabpanel" aria-label="Slide 1 of 5">
      <img src="featured1.jpg" alt="Misty forest path in autumn colors">
      <div class="slide-content">
        <h2>Autumn Forest Path</h2>
        <p>A serene walk through fall foliage in Vermont</p>
      </div>
    </div>
  </div>
  
  <div class="carousel-controls">
    <button aria-label="Previous slide">‹</button>
    <button aria-label="Pause slideshow">⏸</button>
    <button aria-label="Next slide">›</button>
  </div>
  
  <div class="carousel-indicators" role="tablist">
    <button role="tab" aria-selected="true" aria-label="Go to slide 1">1</button>
    <button role="tab" aria-selected="false" aria-label="Go to slide 2">2</button>
  </div>
</section>
```

### Contact Forms

#### Form Structure
- [ ] **Form purpose** clearly stated
- [ ] **Required fields** marked and announced
- [ ] **Field groups** use fieldset/legend
- [ ] **Error handling** accessible and clear
- [ ] **Success messages** announced

```html
<!-- ✅ Accessible contact form -->
<form aria-labelledby="contact-heading">
  <h2 id="contact-heading">Contact for Photography Services</h2>
  
  <fieldset>
    <legend>Contact Information</legend>
    <label for="client-name">Full Name <span aria-label="required">*</span></label>
    <input type="text" id="client-name" required aria-describedby="name-error">
    <div id="name-error" role="alert" class="error"></div>
  </fieldset>
  
  <fieldset>
    <legend>Service Interest</legend>
    <input type="checkbox" id="wedding" name="services" value="wedding">
    <label for="wedding">Wedding Photography</label>
    <input type="checkbox" id="portrait" name="services" value="portrait">
    <label for="portrait">Portrait Sessions</label>
  </fieldset>
  
  <button type="submit">Send Inquiry</button>
</form>
```

## Testing Checklist

### Automated Testing
- [ ] **axe-core** or similar tool run on all pages
- [ ] **Lighthouse accessibility** audit passed
- [ ] **WAVE** tool shows no errors
- [ ] **Color contrast** tools verify ratios

### Manual Testing
- [ ] **Keyboard-only navigation** through entire site
- [ ] **Screen reader testing** (NVDA, JAWS, VoiceOver)
- [ ] **Voice control** testing (Dragon, Voice Control)
- [ ] **Mobile accessibility** testing
- [ ] **High contrast mode** testing
- [ ] **Zoom testing** up to 400%

### User Testing
- [ ] **Users with disabilities** test key workflows
- [ ] **Assistive technology users** provide feedback
- [ ] **Usability testing** with accessibility focus

## Implementation Priority

### High Priority (Must Fix)
1. Alt text for all images
2. Keyboard accessibility
3. Color contrast ratios
4. Form labels and error handling
5. Focus indicators

### Medium Priority (Should Fix)
1. ARIA labels and roles
2. Heading structure
3. Skip links
4. Carousel accessibility
5. Mobile touch targets

### Low Priority (Nice to Have)
1. Advanced ARIA patterns
2. Motion preferences
3. High contrast mode optimization
4. Voice control optimization

This checklist ensures your photography portfolio meets WCAG 2.1 AA standards while providing an excellent user experience for all visitors, including those using assistive technologies.
