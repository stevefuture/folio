const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;
const SITE_URL = process.env.SITE_URL;
const IMAGE_DOMAIN = process.env.IMAGE_DOMAIN;

exports.handler = async (event) => {
  try {
    const { pathParameters, queryStringParameters } = event;
    const path = pathParameters?.proxy || '';
    
    console.log('Generating SEO data for path:', path);
    
    let seoData;
    
    if (path === '' || path === 'home') {
      seoData = await generateHomeSEO();
    } else if (path === 'projects') {
      seoData = await generateProjectsListSEO();
    } else if (path.startsWith('projects/')) {
      const projectId = path.split('/')[1];
      seoData = await generateProjectSEO(projectId);
    } else {
      seoData = generateDefaultSEO(path);
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify(seoData)
    };
    
  } catch (error) {
    console.error('Error generating SEO data:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Failed to generate SEO data',
        message: error.message
      })
    };
  }
};

async function generateHomeSEO() {
  // Get featured projects and carousel items
  const [projectsResult, carouselResult] = await Promise.all([
    dynamodb.query({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :status',
      ExpressionAttributeValues: {
        ':status': 'PROJECT#STATUS#published'
      },
      FilterExpression: 'IsVisible = :visible',
      ExpressionAttributeValues: {
        ':visible': true
      },
      Limit: 6
    }).promise(),
    
    dynamodb.query({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :status',
      ExpressionAttributeValues: {
        ':status': 'CAROUSEL#STATUS#active'
      },
      FilterExpression: 'IsVisible = :visible',
      ExpressionAttributeValues: {
        ':visible': true
      }
    }).promise()
  ]);
  
  const projects = projectsResult.Items || [];
  const carouselItems = carouselResult.Items || [];
  
  // Generate keywords from project categories and tags
  const categories = [...new Set(projects.map(p => p.Category))];
  const allTags = projects.flatMap(p => p.Tags || []);
  const topTags = getTopTags(allTags, 10);
  
  return {
    meta: {
      title: 'Professional Photography Portfolio - Capturing Life\'s Beautiful Moments',
      description: `Award-winning photographer specializing in ${categories.join(', ')}. Explore stunning visual stories and artistic photography showcasing ${projects.length} unique projects.`,
      keywords: ['photography', 'portfolio', 'professional photographer', ...categories, ...topTags],
      canonical: SITE_URL,
      ogImage: carouselItems[0]?.ImagePath ? `${IMAGE_DOMAIN}/${carouselItems[0].ImagePath}?w=1200&h=630&fit=cover&f=webp` : `${SITE_URL}/og-image.jpg`,
      ogType: 'website'
    },
    
    structuredData: [
      // Website schema
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Photography Portfolio',
        url: SITE_URL,
        description: 'Professional photography portfolio showcasing stunning visual stories',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      },
      
      // Organization schema
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Photography Portfolio',
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        sameAs: [
          'https://instagram.com/photographer',
          'https://facebook.com/photographer'
        ]
      },
      
      // Image gallery schema
      {
        '@context': 'https://schema.org',
        '@type': 'ImageGallery',
        name: 'Photography Portfolio Gallery',
        description: `Professional photography collection featuring ${projects.length} projects`,
        numberOfItems: projects.length,
        image: projects.slice(0, 6).map(project => ({
          '@type': 'ImageObject',
          url: `${IMAGE_DOMAIN}/${project.FeaturedImage}?w=800&f=webp`,
          description: project.Title,
          name: project.Title
        }))
      }
    ]
  };
}

async function generateProjectsListSEO() {
  const projectsResult = await dynamodb.query({
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
  }).promise();
  
  const projects = projectsResult.Items || [];
  const categories = [...new Set(projects.map(p => p.Category))];
  
  return {
    meta: {
      title: `Photography Projects - ${projects.length} Professional Collections`,
      description: `Browse ${projects.length} professional photography projects spanning ${categories.join(', ')}. Each collection tells a unique visual story through expert composition and artistic vision.`,
      keywords: ['photography projects', 'photo collections', 'portfolio', ...categories],
      canonical: `${SITE_URL}/projects`,
      ogImage: projects[0]?.FeaturedImage ? `${IMAGE_DOMAIN}/${projects[0].FeaturedImage}?w=1200&h=630&fit=cover&f=webp` : `${SITE_URL}/og-image.jpg`,
      ogType: 'website'
    },
    
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Photography Projects',
        description: `Collection of ${projects.length} professional photography projects`,
        url: `${SITE_URL}/projects`,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: projects.length,
          itemListElement: projects.map((project, index) => ({
            '@type': 'CreativeWork',
            position: index + 1,
            name: project.Title,
            description: project.Description,
            url: `${SITE_URL}/projects/${project.ProjectId}`,
            image: `${IMAGE_DOMAIN}/${project.FeaturedImage}?w=800&f=webp`,
            datePublished: project.PublishedAt,
            author: {
              '@type': 'Person',
              name: 'Professional Photographer'
            }
          }))
        }
      }
    ]
  };
}

async function generateProjectSEO(projectId) {
  // Get project and its images
  const projectResult = await dynamodb.query({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `PROJECT#${projectId}`
    }
  }).promise();
  
  const items = projectResult.Items || [];
  const project = items.find(item => item.EntityType === 'Project');
  const images = items.filter(item => item.EntityType === 'Image' && item.IsVisible);
  
  if (!project) {
    throw new Error('Project not found');
  }
  
  const keywords = [
    'photography',
    project.Category,
    ...(project.Tags || []),
    ...(project.Location ? [project.Location] : [])
  ];
  
  return {
    meta: {
      title: `${project.Title} - Professional Photography Project`,
      description: project.Description || `Explore ${project.Title}, a stunning ${project.Category} photography collection featuring ${images.length} carefully curated images.`,
      keywords,
      canonical: `${SITE_URL}/projects/${projectId}`,
      ogImage: project.FeaturedImage ? `${IMAGE_DOMAIN}/${project.FeaturedImage}?w=1200&h=630&fit=cover&f=webp` : `${SITE_URL}/og-image.jpg`,
      ogType: 'article',
      publishedTime: project.PublishedAt,
      modifiedTime: project.UpdatedAt
    },
    
    structuredData: [
      // Creative work schema
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: project.Title,
        description: project.Description,
        url: `${SITE_URL}/projects/${projectId}`,
        author: {
          '@type': 'Person',
          name: 'Professional Photographer'
        },
        datePublished: project.PublishedAt,
        dateModified: project.UpdatedAt,
        keywords: keywords.join(', '),
        genre: project.Category,
        image: images.map(img => ({
          '@type': 'ImageObject',
          url: `${IMAGE_DOMAIN}/${img.FilePath}?w=800&f=webp`,
          description: img.Title || img.Description,
          width: img.Dimensions?.width,
          height: img.Dimensions?.height
        })),
        ...(project.Location && {
          contentLocation: {
            '@type': 'Place',
            name: project.Location
          }
        })
      },
      
      // Breadcrumb schema
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: SITE_URL
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Projects',
            item: `${SITE_URL}/projects`
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: project.Title,
            item: `${SITE_URL}/projects/${projectId}`
          }
        ]
      }
    ]
  };
}

function generateDefaultSEO(path) {
  const title = path.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Page';
  
  return {
    meta: {
      title: `${title} - Photography Portfolio`,
      description: 'Professional photography portfolio showcasing stunning visual stories',
      keywords: ['photography', 'portfolio'],
      canonical: `${SITE_URL}/${path}`,
      ogImage: `${SITE_URL}/og-image.jpg`,
      ogType: 'website'
    },
    structuredData: []
  };
}

function getTopTags(tags, limit) {
  const tagCount = tags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});
  
  return Object.entries(tagCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, limit)
    .map(([tag]) => tag);
}
