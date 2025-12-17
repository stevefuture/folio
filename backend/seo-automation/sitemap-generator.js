const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;
const SITE_URL = process.env.SITE_URL;

// Generate XML sitemap
exports.handler = async (event) => {
  try {
    console.log('Generating sitemap...');
    
    // Get all published projects
    const projectsParams = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :status',
      ExpressionAttributeValues: {
        ':status': 'PROJECT#STATUS#published'
      },
      FilterExpression: 'IsVisible = :visible',
      ExpressionAttributeValues: {
        ':visible': true
      }
    };
    
    const projectsResult = await dynamodb.query(projectsParams).promise();
    const projects = projectsResult.Items || [];
    
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
    
    // Generate sitemap XML
    const sitemap = generateSitemapXML([...staticPages, ...projectPages]);
    
    // Upload to S3
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: 'sitemap.xml',
      Body: sitemap,
      ContentType: 'application/xml',
      CacheControl: 'public, max-age=3600'
    }).promise();
    
    // Generate sitemap index if needed (for large sites)
    if (projects.length > 1000) {
      const sitemapIndex = generateSitemapIndex();
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: 'sitemap-index.xml',
        Body: sitemapIndex,
        ContentType: 'application/xml',
        CacheControl: 'public, max-age=3600'
      }).promise();
    }
    
    console.log(`Sitemap generated with ${staticPages.length + projectPages.length} URLs`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        urlCount: staticPages.length + projectPages.length,
        lastGenerated: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Error generating sitemap:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Failed to generate sitemap',
        message: error.message
      })
    };
  }
};

function generateSitemapXML(pages) {
  const urls = pages.map(page => {
    const lastmod = page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : '';
    
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

function generateSitemapIndex() {
  const sitemaps = [
    { url: `${SITE_URL}/sitemap.xml`, lastmod: new Date().toISOString() }
  ];
  
  const sitemapEntries = sitemaps.map(sitemap => `  <sitemap>
    <loc>${sitemap.url}</loc>
    <lastmod>${sitemap.lastmod}</lastmod>
  </sitemap>`).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</sitemapindex>`;
}
