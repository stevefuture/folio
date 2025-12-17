const projects = require('./projects');
const images = require('./images');
const carousel = require('./carousel');

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400'
};

// Response helper
const response = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body)
});

// Error response helper
const errorResponse = (statusCode, message, error = null) => {
  console.error('API Error:', { statusCode, message, error });
  return response(statusCode, { 
    error: message,
    ...(process.env.NODE_ENV === 'development' && error && { details: error.message })
  });
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const path = pathParameters?.proxy || '';
    const pathParts = path.split('/').filter(Boolean);

    // Handle CORS preflight
    if (httpMethod === 'OPTIONS') {
      return response(200, {});
    }

    // Parse request body
    let requestBody = {};
    if (body) {
      try {
        requestBody = JSON.parse(body);
      } catch (e) {
        return errorResponse(400, 'Invalid JSON in request body');
      }
    }

    // Route handling
    const [resource, id, subResource, subId] = pathParts;

    // Projects endpoints
    if (resource === 'projects') {
      switch (httpMethod) {
        case 'GET':
          if (!id) {
            // GET /projects or /projects?category=landscape
            const category = queryStringParameters?.category;
            if (category) {
              const result = await projects.getProjectsByCategory(category);
              return response(200, result);
            } else {
              const result = await projects.getPublishedProjects();
              return response(200, result);
            }
          } else if (subResource === 'images') {
            // GET /projects/{id}/images
            const result = await images.getProjectImages(id);
            return response(200, result);
          } else {
            // GET /projects/{id}
            const result = await projects.getProjectById(id);
            return response(200, result);
          }

        case 'POST':
          if (!id) {
            // POST /projects (create project)
            const result = await projects.createProject(requestBody);
            return response(201, result);
          } else if (subResource === 'images') {
            // POST /projects/{id}/images (add image)
            const result = await images.addImage(id, requestBody);
            return response(201, result);
          } else if (subResource === 'images' && subId === 'reorder') {
            // POST /projects/{id}/images/reorder
            const result = await images.reorderImages(id, requestBody.imageOrders);
            return response(200, result);
          } else if (subResource === 'upload-url') {
            // POST /projects/{id}/upload-url
            const { fileName, contentType } = requestBody;
            const result = await images.generateUploadUrl(id, fileName, contentType);
            return response(200, result);
          }
          break;

        case 'PUT':
          if (id && !subResource) {
            // PUT /projects/{id} (update project)
            const result = await projects.updateProject(id, requestBody);
            return response(200, result);
          } else if (id && subResource === 'images' && subId) {
            // PUT /projects/{id}/images/{imageId} (update image)
            const result = await images.updateImage(id, subId, requestBody);
            return response(200, result);
          }
          break;

        case 'DELETE':
          if (id && !subResource) {
            // DELETE /projects/{id} (delete project)
            const result = await projects.deleteProject(id);
            return response(200, result);
          } else if (id && subResource === 'images' && subId) {
            // DELETE /projects/{id}/images/{imageId} (delete image)
            const result = await images.deleteImage(id, subId);
            return response(200, result);
          }
          break;
      }
    }

    // Admin projects endpoints
    if (resource === 'admin' && pathParts[1] === 'projects') {
      const adminId = pathParts[2];
      const adminSubResource = pathParts[3];

      switch (httpMethod) {
        case 'GET':
          if (!adminId) {
            // GET /admin/projects (all projects)
            const result = await projects.getAllProjects();
            return response(200, result);
          } else if (adminSubResource === 'images') {
            // GET /admin/projects/{id}/images
            const status = queryStringParameters?.status;
            if (status) {
              const result = await images.getImagesByStatus(status);
              return response(200, result);
            } else {
              const result = await images.getProjectImages(adminId);
              return response(200, result);
            }
          }
          break;
      }
    }

    // Carousel endpoints
    if (resource === 'carousel') {
      switch (httpMethod) {
        case 'GET':
          if (!id) {
            // GET /carousel (active items for public)
            const result = await carousel.getActiveCarouselItems();
            return response(200, result);
          } else if (id === 'analytics') {
            // GET /carousel/analytics (admin)
            const result = await carousel.getCarouselAnalytics();
            return response(200, result);
          } else {
            // GET /carousel/{id}
            const result = await carousel.getCarouselItemById(id);
            return response(200, result);
          }

        case 'POST':
          if (!id) {
            // POST /carousel (create item)
            const result = await carousel.createCarouselItem(requestBody);
            return response(201, result);
          } else if (id === 'reorder') {
            // POST /carousel/reorder
            const result = await carousel.reorderCarouselItems(requestBody.itemOrders);
            return response(200, result);
          } else if (subResource === 'view') {
            // POST /carousel/{id}/view (increment view count)
            await carousel.incrementViewCount(id);
            return response(200, { success: true });
          } else if (subResource === 'click') {
            // POST /carousel/{id}/click (increment click count)
            await carousel.incrementClickCount(id);
            return response(200, { success: true });
          }
          break;

        case 'PUT':
          if (id) {
            // PUT /carousel/{id} (update item)
            const result = await carousel.updateCarouselItem(id, requestBody);
            return response(200, result);
          }
          break;

        case 'DELETE':
          if (id) {
            // DELETE /carousel/{id} (delete item)
            const result = await carousel.deleteCarouselItem(id);
            return response(200, result);
          }
          break;
      }
    }

    // Admin carousel endpoints
    if (resource === 'admin' && pathParts[1] === 'carousel') {
      const adminId = pathParts[2];

      switch (httpMethod) {
        case 'GET':
          if (!adminId) {
            // GET /admin/carousel (all items)
            const result = await carousel.getAllCarouselItems();
            return response(200, result);
          }
          break;
      }
    }

    // Featured images endpoint
    if (resource === 'featured-images' && httpMethod === 'GET') {
      const result = await images.getFeaturedImages();
      return response(200, result);
    }

    // Health check
    if (resource === 'health' && httpMethod === 'GET') {
      return response(200, { 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    }

    // Route not found
    return errorResponse(404, 'Endpoint not found');

  } catch (error) {
    console.error('Unhandled error:', error);
    
    // Handle specific DynamoDB errors
    if (error.code === 'ConditionalCheckFailedException') {
      return errorResponse(409, 'Resource already exists or condition failed');
    }
    
    if (error.code === 'ResourceNotFoundException') {
      return errorResponse(404, 'Resource not found');
    }
    
    if (error.code === 'ValidationException') {
      return errorResponse(400, 'Invalid request parameters');
    }

    return errorResponse(500, 'Internal server error', error);
  }
};
