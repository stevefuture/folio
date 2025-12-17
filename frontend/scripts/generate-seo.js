const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.yourdomain.com';
const OUTPUT_DIR = process.env.DEPLOYMENT_TARGET === 'amplify' ? '.next' : 'out';

async function generateSEOFiles() {
  console.log('🔍 Generating SEO files...');
  
  try {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Generate sitemap.xml
    await generateSitemap();
    
    // Generate robots.txt
    await generateRobots();
    
    // Generate meta tags cache
    await generateMetaCache();
    
    console.log('✅ SEO files generated successfully');
    
  } catch (error) {
    console.error('❌ Error generating SEO files:', error);
    process.exit(1);
  }
}

async function generateSitemap() {
  console.log('📄 Generating sitemap.xml...');
  
  try {
    // Fetch projects from API
    const response = await fetch(`${API_URL}/api/projects`);
    const projects = response.ok ? await response.json() : [];
    
    // Static pages
    const staticPages = [
      { url: '', priority: '1.0', changefreq: 'weekly' },
      { url: '/projects', priority: '0.9', changefreq: 'daily' },
      { url: '/about', priority: '0.8', changefreq: 'monthly' },
      { url: '/contact', priority: '0.8', changefreq: 'monthly' }
    ];
    
    // Dynamic project pages
    const projectPages = projects.map(project => ({
      url: `/projects/${project.ProjectId}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: project.UpdatedAt || project.CreatedAt
    }));
    
    // Generate XML
    const allPages = [...staticPages, ...projectPages];
    const sitemap = generateSitemapXML(allPages);
    
    // Write sitemap
    const sitemapPath = path.join(OUTPUT_DIR, 'sitemap.xml');
    fs.writeFileSync(sitemapPath, sitemap);
    
    console.log(`✅ Sitemap generated with ${allPages.length} URLs: ${sitemapPath}`);
    
  } catch (error) {
    console.error('Error generating sitemap:', error);
    // Generate basic sitemap as fallback
    const basicSitemap = generateSitemapXML([
      { url: '', priority: '1.0', changefreq: 'weekly' }
    ]);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), basicSitemap);
  }
}

async function generateRobots() {
  console.log('🤖 Generating robots.txt...');
  
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'production';
  let robotsContent;
  
  if (environment === 'production') {
    robotsContent = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml

# Crawl delay
Crawl-delay: 1

# Disallow admin areas
Disallow: /admin/
Disallow: /api/
Disallow: /_next/

# Allow specific bots
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# Block aggressive crawlers
User-agent: AhrefsBot
Disallow: /

User-agent: MJ12bot
Disallow: /`;
  } else {
    robotsContent = `User-agent: *
Disallow: /

# This is a ${environment} environment`;
  }
  
  const robotsPath = path.join(OUTPUT_DIR, 'robots.txt');
  fs.writeFileSync(robotsPath, robotsContent);
  
  console.log(`✅ Robots.txt generated for ${environment}: ${robotsPath}`);
}

async function generateMetaCache() {
  console.log('🏷️ Generating meta tags cache...');
  
  try {
    // Fetch projects for meta generation
    const response = await fetch(`${API_URL}/api/projects`);
    const projects = response.ok ? await response.json() : [];
    
    const metaCache = {
      '/': generateHomeMeta(projects),
      '/projects': generateProjectsListMeta(projects)
    };
    
    // Generate meta for each project
    for (const project of projects.slice(0, 50)) { // Limit to prevent build timeout
      metaCache[`/projects/${project.ProjectId}`] = generateProjectMeta(project);
    }
    
    // Write meta cache
    const metaCachePath = path.join(OUTPUT_DIR, 'meta-cache.json');
    fs.writeFileSync(metaCachePath, JSON.stringify(metaCache, null, 2));
    
    console.log(`✅ Meta cache generated with ${Object.keys(metaCache).length} pages: ${metaCachePath}`);
    
  } catch (error) {
    console.error('Error generating meta cache:', error);
    // Generate basic meta cache
    const basicMeta = {
      '/': {
        title: 'Photography Portfolio',
        description: 'Professional photography portfolio',
        keywords: ['photography', 'portfolio']
      }
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'meta-cache.json'), JSON.stringify(basicMeta, null, 2));
  }
}

function generateSitemapXML(pages) {
  const urls = pages.map(page => {
    const lastmod = page.lastmod ? `    <lastmod>${page.lastmod}</lastmod>` : '';
    
    return `  <url>
    <loc>${SITE_URL}${page.url}</loc>
${lastmod}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function generateHomeMeta(projects) {
  const categories = [...new Set(projects.map(p => p.Category))].slice(0, 5);
  
  return {
    title: 'Professional Photography Portfolio - Capturing Life\'s Beautiful Moments',
    description: `Award-winning photographer specializing in ${categories.join(', ')}. Explore ${projects.length} stunning photography projects and visual stories.`,
    keywords: ['photography', 'portfolio', 'professional photographer', ...categories],
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Photography Portfolio',
        url: SITE_URL,
        description: 'Professional photography portfolio showcasing stunning visual stories'
      }
    ]
  };
}

function generateProjectsListMeta(projects) {
  const categories = [...new Set(projects.map(p => p.Category))];
  
  return {
    title: `Photography Projects - ${projects.length} Professional Collections`,
    description: `Browse ${projects.length} professional photography projects spanning ${categories.join(', ')}.`,
    keywords: ['photography projects', 'photo collections', ...categories]
  };
}

function generateProjectMeta(project) {
  return {
    title: `${project.Title} - Professional Photography Project`,
    description: project.Description || `Explore ${project.Title}, a stunning ${project.Category} photography collection.`,
    keywords: [project.Category, ...(project.Tags || [])],
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: project.Title,
        description: project.Description,
        author: {
          '@type': 'Person',
          name: 'Professional Photographer'
        },
        datePublished: project.PublishedAt,
        genre: project.Category
      }
    ]
  };
}

// Run if called directly
if (require.main === module) {
  generateSEOFiles();
}

module.exports = { generateSEOFiles };
