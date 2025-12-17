const fs = require('fs');
const path = require('path');

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com';
const OUTPUT_DIR = process.env.DEPLOYMENT_TARGET === 'amplify' ? '.next' : 'out';

// Static pages
const staticPages = [
  '',
  '/projects',
  '/about',
  '/contact'
];

// Generate sitemap XML
function generateSitemap() {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(page => `  <url>
    <loc>${SITE_URL}${page}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>${page === '' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

  // Write sitemap
  const sitemapPath = path.join(OUTPUT_DIR, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, sitemap);
  console.log(`✅ Sitemap generated: ${sitemapPath}`);

  // Generate robots.txt
  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml`;

  const robotsPath = path.join(OUTPUT_DIR, 'robots.txt');
  fs.writeFileSync(robotsPath, robots);
  console.log(`✅ Robots.txt generated: ${robotsPath}`);
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

generateSitemap();
