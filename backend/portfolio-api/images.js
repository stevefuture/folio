const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

// Get images for a project
exports.getProjectImages = async (projectId) => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `PROJECT#${projectId}`,
      ':sk': 'IMAGE#'
    }
  };

  const result = await dynamodb.query(params).promise();
  return result.Items
    .filter(item => item.EntityType === 'Image' && item.IsVisible)
    .sort((a, b) => a.SortOrder - b.SortOrder);
};

// Get all images by status (admin)
exports.getImagesByStatus = async (status) => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :status',
    ExpressionAttributeValues: {
      ':status': `IMAGE#STATUS#${status}`
    },
    ScanIndexForward: false
  };

  const result = await dynamodb.query(params).promise();
  return result.Items;
};

// Get featured images
exports.getFeaturedImages = async () => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :featured',
    ExpressionAttributeValues: {
      ':featured': 'IMAGE#FEATURED#true'
    },
    FilterExpression: '#status = :status AND IsVisible = :visible',
    ExpressionAttributeNames: {
      '#status': 'Status'
    },
    ExpressionAttributeValues: {
      ':status': 'published',
      ':visible': true
    },
    ScanIndexForward: false
  };

  const result = await dynamodb.query(params).promise();
  return result.Items;
};

// Add image to project (admin)
exports.addImage = async (projectId, imageData) => {
  const imageId = imageData.imageId || `${Date.now()}-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Generate sort order if not provided
  let sortOrder = imageData.sortOrder;
  if (sortOrder === undefined) {
    // Get current max sort order for project
    const existingImages = await exports.getProjectImages(projectId);
    sortOrder = existingImages.length > 0 
      ? Math.max(...existingImages.map(img => img.SortOrder || 0)) + 1 
      : 1;
  }

  const image = {
    PK: `PROJECT#${projectId}`,
    SK: `IMAGE#${String(sortOrder).padStart(3, '0')}#${imageId}`,
    GSI1PK: `IMAGE#STATUS#${imageData.status || 'draft'}`,
    GSI1SK: now,
    GSI2PK: imageData.isFeatured ? 'IMAGE#FEATURED#true' : 'IMAGE#FEATURED#false',
    GSI2SK: now,
    EntityType: 'Image',
    ImageId: imageId,
    ProjectId: projectId,
    Title: imageData.title || '',
    Description: imageData.description || '',
    FileName: imageData.fileName,
    FilePath: imageData.filePath,
    ThumbnailPath: imageData.thumbnailPath || '',
    FileSize: imageData.fileSize || 0,
    Dimensions: imageData.dimensions || { width: 0, height: 0 },
    Format: imageData.format || 'JPEG',
    Status: imageData.status || 'draft',
    SortOrder: sortOrder,
    IsFeatured: imageData.isFeatured || false,
    IsVisible: imageData.isVisible !== false,
    Tags: imageData.tags || [],
    Location: imageData.location || '',
    CreatedAt: now,
    UpdatedAt: now,
    PublishedAt: imageData.status === 'published' ? now : null,
    ViewCount: 0,
    ExifData: imageData.exifData || {},
    ColorPalette: imageData.colorPalette || []
  };

  // Start transaction to add image and update project image count
  const transactParams = {
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: image,
          ConditionExpression: 'attribute_not_exists(PK)'
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: 'PROJECT',
            SK: `PROJECT#${projectId}`
          },
          UpdateExpression: 'ADD ImageCount :inc SET UpdatedAt = :now',
          ExpressionAttributeValues: {
            ':inc': 1,
            ':now': now
          }
        }
      }
    ]
  };

  await dynamodb.transactWrite(transactParams).promise();
  return image;
};

// Update image (admin)
exports.updateImage = async (projectId, imageId, updates) => {
  const now = new Date().toISOString();
  
  // Build update expression
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  Object.keys(updates).forEach(key => {
    if (key !== 'imageId' && key !== 'projectId' && updates[key] !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = updates[key];
    }
  });
  
  // Always update UpdatedAt
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
  expressionAttributeValues[':updatedAt'] = now;
  
  // Update GSI keys if status or featured status changed
  if (updates.status) {
    updateExpressions.push('#gsi1pk = :gsi1pk');
    expressionAttributeNames['#gsi1pk'] = 'GSI1PK';
    expressionAttributeValues[':gsi1pk'] = `IMAGE#STATUS#${updates.status}`;
  }
  
  if (updates.isFeatured !== undefined) {
    updateExpressions.push('#gsi2pk = :gsi2pk');
    expressionAttributeNames['#gsi2pk'] = 'GSI2PK';
    expressionAttributeValues[':gsi2pk'] = `IMAGE#FEATURED#${updates.isFeatured}`;
  }

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `PROJECT#${projectId}`,
      SK: `IMAGE#${imageId}`
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamodb.update(params).promise();
  return result.Attributes;
};

// Delete image (admin)
exports.deleteImage = async (projectId, imageId) => {
  const now = new Date().toISOString();
  
  // Get image details first
  const getParams = {
    TableName: TABLE_NAME,
    Key: {
      PK: `PROJECT#${projectId}`,
      SK: `IMAGE#${imageId}`
    }
  };
  
  const imageResult = await dynamodb.get(getParams).promise();
  if (!imageResult.Item) {
    throw new Error('Image not found');
  }

  // Transaction to delete image and update project count
  const transactParams = {
    TransactItems: [
      {
        Delete: {
          TableName: TABLE_NAME,
          Key: {
            PK: `PROJECT#${projectId}`,
            SK: `IMAGE#${imageId}`
          }
        }
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: 'PROJECT',
            SK: `PROJECT#${projectId}`
          },
          UpdateExpression: 'ADD ImageCount :dec SET UpdatedAt = :now',
          ExpressionAttributeValues: {
            ':dec': -1,
            ':now': now
          }
        }
      }
    ]
  };

  await dynamodb.transactWrite(transactParams).promise();
  
  // Optionally delete from S3 (uncomment if needed)
  // if (imageResult.Item.FilePath) {
  //   await s3.deleteObject({
  //     Bucket: BUCKET_NAME,
  //     Key: imageResult.Item.FilePath
  //   }).promise();
  // }

  return { deleted: true, image: imageResult.Item };
};

// Generate presigned URL for image upload (admin)
exports.generateUploadUrl = async (projectId, fileName, contentType) => {
  const key = `projects/${projectId}/${fileName}`;
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Expires: 300 // 5 minutes
  };

  const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
  
  return {
    uploadUrl,
    key,
    fileName
  };
};

// Reorder images in project (admin)
exports.reorderImages = async (projectId, imageOrders) => {
  const now = new Date().toISOString();
  
  // Build transaction items for all image updates
  const transactItems = imageOrders.map(({ imageId, sortOrder }) => ({
    Update: {
      TableName: TABLE_NAME,
      Key: {
        PK: `PROJECT#${projectId}`,
        SK: `IMAGE#${imageId}`
      },
      UpdateExpression: 'SET SortOrder = :sortOrder, UpdatedAt = :now',
      ExpressionAttributeValues: {
        ':sortOrder': sortOrder,
        ':now': now
      }
    }
  }));

  // Add project update
  transactItems.push({
    Update: {
      TableName: TABLE_NAME,
      Key: {
        PK: 'PROJECT',
        SK: `PROJECT#${projectId}`
      },
      UpdateExpression: 'SET UpdatedAt = :now',
      ExpressionAttributeValues: {
        ':now': now
      }
    }
  });

  const transactParams = {
    TransactItems: transactItems
  };

  await dynamodb.transactWrite(transactParams).promise();
  return { reordered: imageOrders.length };
};
