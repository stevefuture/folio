const AWS = require('aws-sdk');
const sharp = require('sharp');

const s3 = new AWS.S3();
const SOURCE_BUCKET = process.env.SOURCE_BUCKET;
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET;
const MAX_WIDTH = parseInt(process.env.MAX_WIDTH) || 2048;
const MAX_HEIGHT = parseInt(process.env.MAX_HEIGHT) || 2048;
const DEFAULT_QUALITY = parseInt(process.env.QUALITY) || 85;

// Supported formats and their MIME types
const FORMATS = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png'
};

// Parse query parameters for image transformations
function parseParams(queryStringParameters) {
  const params = queryStringParameters || {};
  
  return {
    width: params.w ? parseInt(params.w) : null,
    height: params.h ? parseInt(params.h) : null,
    quality: params.q ? parseInt(params.q) : DEFAULT_QUALITY,
    format: params.f || 'auto',
    fit: params.fit || 'cover', // cover, contain, fill, inside, outside
    auto: params.auto === 'true' || params.auto === '1'
  };
}

// Determine optimal format based on Accept header and auto parameter
function determineFormat(acceptHeader, requestedFormat, auto) {
  if (requestedFormat && requestedFormat !== 'auto' && FORMATS[requestedFormat]) {
    return requestedFormat;
  }
  
  if (auto && acceptHeader) {
    if (acceptHeader.includes('image/avif')) return 'avif';
    if (acceptHeader.includes('image/webp')) return 'webp';
  }
  
  return 'jpeg'; // Default fallback
}

// Generate cache key for processed image
function generateCacheKey(key, params, format) {
  const { width, height, quality, fit } = params;
  const dimensions = [width, height].filter(Boolean).join('x');
  return `processed/${key}/${dimensions}_q${quality}_${fit}.${format}`;
}

// Process image with Sharp
async function processImage(imageBuffer, params, format) {
  let pipeline = sharp(imageBuffer);
  
  // Get image metadata
  const metadata = await pipeline.metadata();
  
  // Calculate dimensions respecting max limits
  let { width, height } = params;
  
  if (width && width > MAX_WIDTH) width = MAX_WIDTH;
  if (height && height > MAX_HEIGHT) height = MAX_HEIGHT;
  
  // Apply transformations
  if (width || height) {
    const resizeOptions = {
      width,
      height,
      fit: params.fit,
      withoutEnlargement: true
    };
    pipeline = pipeline.resize(resizeOptions);
  }
  
  // Apply format-specific optimizations
  switch (format) {
    case 'webp':
      pipeline = pipeline.webp({ 
        quality: params.quality,
        effort: 4
      });
      break;
    case 'avif':
      pipeline = pipeline.avif({ 
        quality: params.quality,
        effort: 4
      });
      break;
    case 'jpeg':
    case 'jpg':
      pipeline = pipeline.jpeg({ 
        quality: params.quality,
        progressive: true,
        mozjpeg: true
      });
      break;
    case 'png':
      pipeline = pipeline.png({ 
        quality: params.quality,
        compressionLevel: 9
      });
      break;
  }
  
  return pipeline.toBuffer();
}

exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    // Extract image path from URL
    const path = event.rawPath || event.pathParameters?.proxy || '';
    const key = path.startsWith('/') ? path.slice(1) : path;
    
    if (!key) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Image path required' })
      };
    }
    
    // Parse transformation parameters
    const params = parseParams(event.queryStringParameters);
    const acceptHeader = event.headers?.accept || event.headers?.Accept || '';
    const format = determineFormat(acceptHeader, params.format, params.auto);
    
    // Generate cache key
    const cacheKey = generateCacheKey(key, params, format);
    
    try {
      // Check if processed image exists in cache
      const cachedImage = await s3.getObject({
        Bucket: PROCESSED_BUCKET,
        Key: cacheKey
      }).promise();
      
      console.log('Serving cached image:', cacheKey);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': FORMATS[format],
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': cachedImage.Body.length.toString()
        },
        body: cachedImage.Body.toString('base64'),
        isBase64Encoded: true
      };
    } catch (cacheError) {
      // Image not in cache, process it
      console.log('Image not cached, processing:', key);
    }
    
    // Get original image from source bucket
    const originalImage = await s3.getObject({
      Bucket: SOURCE_BUCKET,
      Key: key
    }).promise();
    
    // Process the image
    const processedBuffer = await processImage(originalImage.Body, params, format);
    
    // Store processed image in cache bucket
    await s3.putObject({
      Bucket: PROCESSED_BUCKET,
      Key: cacheKey,
      Body: processedBuffer,
      ContentType: FORMATS[format],
      CacheControl: 'public, max-age=31536000, immutable'
    }).promise();
    
    console.log('Processed and cached image:', cacheKey);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': FORMATS[format],
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': processedBuffer.length.toString(),
        'X-Image-Processed': 'true'
      },
      body: processedBuffer.toString('base64'),
      isBase64Encoded: true
    };
    
  } catch (error) {
    console.error('Error processing image:', error);
    
    // Return appropriate error response
    if (error.code === 'NoSuchKey') {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Image not found' })
      };
    }
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
