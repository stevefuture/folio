# Image Optimization Service

## Overview

On-demand image optimization service using AWS Lambda and CloudFront for automatic format conversion (WebP, AVIF), responsive resizing, and intelligent caching.

## Architecture

```
Original Image (S3) → Lambda Function → Processed Image (S3 Cache) → CloudFront → User
```

### Components
- **Source Bucket**: Original high-resolution images
- **Lambda Function**: Sharp-based image processing
- **Cache Bucket**: Processed images (30-day lifecycle)
- **CloudFront**: Global CDN with intelligent caching

## URL Format

```
https://d1234567890.cloudfront.net/path/to/image.jpg?w=800&h=600&f=webp&q=85
```

## Query Parameters

| Parameter | Description | Example | Default |
|-----------|-------------|---------|---------|
| `w` | Width in pixels | `w=800` | Original |
| `h` | Height in pixels | `h=600` | Original |
| `q` | Quality (1-100) | `q=85` | 85 |
| `f` | Format | `f=webp` | auto |
| `fit` | Resize behavior | `fit=cover` | cover |
| `auto` | Auto format detection | `auto=true` | false |

## Supported Formats

### Input Formats
- JPEG/JPG
- PNG
- WebP
- AVIF
- TIFF
- GIF (static)

### Output Formats
- **WebP**: Modern format, 25-35% smaller than JPEG
- **AVIF**: Next-gen format, 50% smaller than JPEG
- **JPEG**: Universal compatibility
- **PNG**: Lossless compression

## Resize Behaviors (`fit` parameter)

| Value | Description | Use Case |
|-------|-------------|----------|
| `cover` | Crop to exact dimensions | Thumbnails, hero images |
| `contain` | Fit within dimensions | Product images, logos |
| `fill` | Stretch to dimensions | Backgrounds |
| `inside` | Resize to fit inside | Responsive images |
| `outside` | Resize to fit outside | Full-width images |

## Usage Examples

### Basic Resizing
```html
<!-- Resize to 800x600 -->
<img src="https://images.yourdomain.com/photo.jpg?w=800&h=600" alt="Photo">
```

### Responsive Images
```html
<picture>
  <!-- Modern browsers with AVIF support -->
  <source srcset="https://images.yourdomain.com/photo.jpg?w=800&f=avif&auto=true" type="image/avif">
  
  <!-- Browsers with WebP support -->
  <source srcset="https://images.yourdomain.com/photo.jpg?w=800&f=webp&auto=true" type="image/webp">
  
  <!-- Fallback for all browsers -->
  <img src="https://images.yourdomain.com/photo.jpg?w=800&f=jpeg" alt="Photo">
</picture>
```

### Responsive Breakpoints
```html
<img 
  src="https://images.yourdomain.com/photo.jpg?w=800&auto=true"
  srcset="
    https://images.yourdomain.com/photo.jpg?w=400&auto=true 400w,
    https://images.yourdomain.com/photo.jpg?w=800&auto=true 800w,
    https://images.yourdomain.com/photo.jpg?w=1200&auto=true 1200w
  "
  sizes="(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px"
  alt="Responsive photo"
>
```

### Auto Format Detection
```javascript
// Automatically serves WebP to Chrome, AVIF to newer browsers
const imageUrl = `https://images.yourdomain.com/photo.jpg?w=800&auto=true`;
```

## JavaScript Integration

### Dynamic Image URLs
```javascript
function generateImageUrl(path, options = {}) {
  const {
    width,
    height,
    quality = 85,
    format = 'auto',
    fit = 'cover',
    auto = true
  } = options;
  
  const params = new URLSearchParams();
  if (width) params.set('w', width);
  if (height) params.set('h', height);
  if (quality !== 85) params.set('q', quality);
  if (format !== 'auto') params.set('f', format);
  if (fit !== 'cover') params.set('fit', fit);
  if (auto) params.set('auto', 'true');
  
  return `https://images.yourdomain.com/${path}?${params.toString()}`;
}

// Usage
const thumbnailUrl = generateImageUrl('gallery/photo1.jpg', {
  width: 300,
  height: 300,
  fit: 'cover'
});
```

### React Component
```jsx
import React from 'react';

const OptimizedImage = ({ 
  src, 
  alt, 
  width, 
  height, 
  quality = 85,
  className 
}) => {
  const baseUrl = 'https://images.yourdomain.com';
  
  const generateSrc = (w, h, format) => {
    const params = new URLSearchParams({
      w: w.toString(),
      ...(h && { h: h.toString() }),
      q: quality.toString(),
      auto: 'true'
    });
    if (format) params.set('f', format);
    
    return `${baseUrl}/${src}?${params.toString()}`;
  };
  
  return (
    <picture>
      <source 
        srcSet={generateSrc(width, height, 'avif')} 
        type="image/avif" 
      />
      <source 
        srcSet={generateSrc(width, height, 'webp')} 
        type="image/webp" 
      />
      <img 
        src={generateSrc(width, height)} 
        alt={alt}
        className={className}
        loading="lazy"
      />
    </picture>
  );
};

// Usage
<OptimizedImage 
  src="gallery/sunset.jpg" 
  alt="Beautiful sunset" 
  width={800} 
  height={600}
  className="hero-image"
/>
```

## Performance Optimization

### Caching Strategy
- **CloudFront**: 7 days default, 1 year max
- **S3 Cache**: 30 days lifecycle
- **Browser**: Immutable cache headers

### Cache Keys
Images are cached based on:
- Original image path
- Dimensions (width x height)
- Quality setting
- Output format
- Fit behavior

### Cache Invalidation
```bash
# Invalidate specific image
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/path/to/image.jpg*"

# Invalidate all processed versions
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/processed/*"
```

## Monitoring & Debugging

### CloudWatch Metrics
- Lambda invocations and duration
- Error rates and timeouts
- Cache hit/miss ratios
- Processing time by image size

### Debug Headers
```bash
curl -I "https://images.yourdomain.com/photo.jpg?w=800&auto=true"

# Response headers
X-Image-Processed: true          # Indicates fresh processing
Cache-Control: public, max-age=31536000, immutable
Content-Type: image/webp
```

### Logs
```bash
# View Lambda logs
aws logs tail /aws/lambda/ImageOptimizationFunction --follow

# Common log patterns
"Serving cached image: processed/photo.jpg/800x600_q85_cover.webp"
"Image not cached, processing: photo.jpg"
"Processed and cached image: processed/photo.jpg/800x600_q85_cover.webp"
```

## Cost Optimization

### Estimated Costs (per 1M requests)
- **Lambda**: $2-5 (depending on processing time)
- **S3 Storage**: $0.50-2 (cache bucket)
- **CloudFront**: $8-12 (data transfer)
- **Total**: ~$10-20 per 1M optimized images

### Cost Reduction Tips
1. **Use appropriate quality settings** (70-85 for photos)
2. **Enable auto format detection** (smaller file sizes)
3. **Set reasonable max dimensions** (2048px default)
4. **Monitor cache hit ratios** (aim for >90%)

## Troubleshooting

### Common Issues

**404 Not Found**
- Check original image exists in source bucket
- Verify S3 permissions for Lambda role

**500 Internal Server Error**
- Check Lambda logs for processing errors
- Verify Sharp layer is attached
- Check memory/timeout limits

**Poor Performance**
- Monitor Lambda cold starts
- Check CloudFront cache hit ratio
- Verify appropriate cache headers

**Large File Sizes**
- Reduce quality parameter
- Use WebP/AVIF formats
- Check original image resolution

### Testing
```bash
# Test different formats
curl -H "Accept: image/avif" "https://images.yourdomain.com/test.jpg?w=800&auto=true"
curl -H "Accept: image/webp" "https://images.yourdomain.com/test.jpg?w=800&auto=true"
curl -H "Accept: image/jpeg" "https://images.yourdomain.com/test.jpg?w=800&auto=true"

# Test responsive sizes
for size in 400 800 1200; do
  curl -o "test-${size}.webp" "https://images.yourdomain.com/test.jpg?w=${size}&f=webp"
done
```

This image optimization service provides automatic format conversion, responsive resizing, and intelligent caching for optimal performance and user experience.
