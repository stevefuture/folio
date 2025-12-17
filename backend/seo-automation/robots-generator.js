const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.BUCKET_NAME;
const SITE_URL = process.env.SITE_URL;
const ENVIRONMENT = process.env.ENVIRONMENT || 'production';

exports.handler = async (event) => {
  try {
    console.log(`Generating robots.txt for ${ENVIRONMENT} environment...`);
    
    let robotsContent;
    
    if (ENVIRONMENT === 'production') {
      // Production robots.txt - allow all
      robotsContent = `User-agent: *
Allow: /

# Sitemaps
Sitemap: ${SITE_URL}/sitemap.xml

# Crawl delay for respectful crawling
Crawl-delay: 1

# Disallow admin areas
Disallow: /admin/
Disallow: /api/
Disallow: /_next/
Disallow: /static/

# Allow specific bots
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

# Block aggressive crawlers
User-agent: AhrefsBot
Disallow: /

User-agent: MJ12bot
Disallow: /

User-agent: DotBot
Disallow: /`;
    } else {
      // Staging/development robots.txt - disallow all
      robotsContent = `User-agent: *
Disallow: /

# This is a ${ENVIRONMENT} environment
# Please do not index this site`;
    }
    
    // Upload to S3
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: 'robots.txt',
      Body: robotsContent,
      ContentType: 'text/plain',
      CacheControl: 'public, max-age=86400'
    }).promise();
    
    console.log('Robots.txt generated successfully');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        environment: ENVIRONMENT,
        lastGenerated: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Error generating robots.txt:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Failed to generate robots.txt',
        message: error.message
      })
    };
  }
};
