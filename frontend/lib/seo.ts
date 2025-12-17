interface SEOData {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  keywords?: string[];
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
}

interface ProjectSEO extends SEOData {
  projectId: string;
  category: string;
  imageCount: number;
  location?: string;
  tags: string[];
}

interface ImageSEO {
  url: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
}

// Generate dynamic meta tags
export function generateMetaTags(seoData: SEOData): Record<string, string> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Photography Portfolio';
  
  return {
    title: seoData.title,
    description: seoData.description,
    keywords: seoData.keywords?.join(', ') || '',
    author: seoData.author || '',
    canonical: seoData.canonical || '',
    
    // Open Graph
    'og:title': seoData.title,
    'og:description': seoData.description,
    'og:type': seoData.ogType || 'website',
    'og:url': seoData.canonical || '',
    'og:image': seoData.ogImage || `${baseUrl}/og-image.jpg`,
    'og:site_name': siteName,
    
    // Twitter
    'twitter:card': 'summary_large_image',
    'twitter:title': seoData.title,
    'twitter:description': seoData.description,
    'twitter:image': seoData.ogImage || `${baseUrl}/og-image.jpg`,
    
    // Additional
    ...(seoData.publishedTime && { 'article:published_time': seoData.publishedTime }),
    ...(seoData.modifiedTime && { 'article:modified_time': seoData.modifiedTime }),
    ...(seoData.noindex && { robots: 'noindex,nofollow' })
  };
}

// Generate JSON-LD structured data for website
export function generateWebsiteSchema(): object {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Photography Portfolio';
  
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: baseUrl,
    description: 'Professional photography portfolio showcasing stunning visual stories',
    author: {
      '@type': 'Person',
      name: 'Professional Photographer',
      url: baseUrl,
      sameAs: [
        'https://instagram.com/photographer',
        'https://facebook.com/photographer'
      ]
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };
}

// Generate JSON-LD for photography project
export function generateProjectSchema(project: ProjectSEO, images: ImageSEO[]): object {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${baseUrl}/projects/${project.projectId}`,
    name: project.title,
    description: project.description,
    url: `${baseUrl}/projects/${project.projectId}`,
    author: {
      '@type': 'Person',
      name: 'Professional Photographer',
      url: baseUrl
    },
    creator: {
      '@type': 'Person',
      name: 'Professional Photographer'
    },
    datePublished: project.publishedTime,
    dateModified: project.modifiedTime,
    keywords: project.tags.join(', '),
    genre: project.category,
    ...(project.location && {
      contentLocation: {
        '@type': 'Place',
        name: project.location
      }
    }),
    image: images.map(img => ({
      '@type': 'ImageObject',
      url: img.url,
      description: img.alt,
      width: img.width,
      height: img.height,
      ...(img.caption && { caption: img.caption })
    })),
    mainEntity: {
      '@type': 'ImageGallery',
      name: `${project.title} - Photo Gallery`,
      description: `Gallery containing ${project.imageCount} images from ${project.title}`,
      numberOfItems: project.imageCount
    }
  };
}

// Generate JSON-LD for image gallery
export function generateImageGallerySchema(
  title: string,
  description: string,
  images: ImageSEO[]
): object {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: title,
    description: description,
    url: baseUrl,
    numberOfItems: images.length,
    image: images.map(img => ({
      '@type': 'ImageObject',
      url: img.url,
      description: img.alt,
      width: img.width,
      height: img.height,
      contentUrl: img.url,
      thumbnailUrl: img.url.replace('?', '?w=400&h=400&fit=cover&')
    }))
  };
}

// Generate breadcrumb schema
export function generateBreadcrumbSchema(breadcrumbs: Array<{name: string, url: string}>): object {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${baseUrl}${crumb.url}`
    }))
  };
}

// Generate organization schema
export function generateOrganizationSchema(): object {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Photography Portfolio';
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    description: 'Professional photography services specializing in landscapes, portraits, and artistic photography',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'hello@photographer.com',
      availableLanguage: 'English'
    },
    sameAs: [
      'https://instagram.com/photographer',
      'https://facebook.com/photographer',
      'https://twitter.com/photographer'
    ],
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Your City',
      addressRegion: 'Your State',
      addressCountry: 'Your Country'
    }
  };
}

// SEO-friendly URL generation
export function generateSEOUrl(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Extract keywords from content
export function extractKeywords(content: string, maxKeywords: number = 10): string[] {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
  ]);
  
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word));
  
  const wordCount = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}
