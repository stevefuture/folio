const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;

// Get active carousel items (public)
exports.getActiveCarouselItems = async () => {
  const params = {
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
  };

  const result = await dynamodb.query(params).promise();
  
  // Sort by position
  return result.Items.sort((a, b) => a.Position - b.Position);
};

// Get all carousel items (admin)
exports.getAllCarouselItems = async () => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'CAROUSEL'
    }
  };

  const result = await dynamodb.query(params).promise();
  return result.Items.sort((a, b) => a.Position - b.Position);
};

// Get carousel item by ID
exports.getCarouselItemById = async (itemId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CAROUSEL',
      SK: `ITEM#${itemId}`
    }
  };

  const result = await dynamodb.get(params).promise();
  if (!result.Item) {
    throw new Error('Carousel item not found');
  }
  
  return result.Item;
};

// Create carousel item (admin)
exports.createCarouselItem = async (itemData) => {
  const itemId = itemData.itemId || `slide-${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  // Get next position if not provided
  let position = itemData.position;
  if (position === undefined) {
    const existingItems = await exports.getAllCarouselItems();
    position = existingItems.length > 0 
      ? Math.max(...existingItems.map(item => item.Position || 0)) + 1 
      : 1;
  }

  const carouselItem = {
    PK: 'CAROUSEL',
    SK: `ITEM#${String(position).padStart(3, '0')}#${itemId}`,
    GSI1PK: `CAROUSEL#STATUS#${itemData.status || 'draft'}`,
    GSI1SK: String(position).padStart(3, '0'),
    EntityType: 'CarouselItem',
    ItemId: itemId,
    Title: itemData.title || '',
    Subtitle: itemData.subtitle || '',
    Description: itemData.description || '',
    ImagePath: itemData.imagePath || '',
    MobileImagePath: itemData.mobileImagePath || '',
    LinkType: itemData.linkType || 'none', // none, project, external, page
    LinkTarget: itemData.linkTarget || '',
    LinkUrl: itemData.linkUrl || '',
    ButtonText: itemData.buttonText || 'Learn More',
    Position: position,
    Status: itemData.status || 'draft',
    IsVisible: itemData.isVisible !== false,
    DisplayDuration: itemData.displayDuration || 5000,
    TransitionType: itemData.transitionType || 'fade',
    TextPosition: itemData.textPosition || 'center-left',
    TextColor: itemData.textColor || '#FFFFFF',
    OverlayOpacity: itemData.overlayOpacity || 0.3,
    CreatedAt: now,
    UpdatedAt: now,
    ScheduledStart: itemData.scheduledStart || null,
    ScheduledEnd: itemData.scheduledEnd || null,
    ViewCount: 0,
    ClickCount: 0
  };

  const params = {
    TableName: TABLE_NAME,
    Item: carouselItem,
    ConditionExpression: 'attribute_not_exists(PK)'
  };

  await dynamodb.put(params).promise();
  return carouselItem;
};

// Update carousel item (admin)
exports.updateCarouselItem = async (itemId, updates) => {
  const now = new Date().toISOString();
  
  // Build update expression
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  Object.keys(updates).forEach(key => {
    if (key !== 'itemId' && updates[key] !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = updates[key];
    }
  });
  
  // Always update UpdatedAt
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
  expressionAttributeValues[':updatedAt'] = now;
  
  // Update GSI1PK if status changed
  if (updates.status) {
    updateExpressions.push('#gsi1pk = :gsi1pk');
    expressionAttributeNames['#gsi1pk'] = 'GSI1PK';
    expressionAttributeValues[':gsi1pk'] = `CAROUSEL#STATUS#${updates.status}`;
  }

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CAROUSEL',
      SK: `ITEM#${itemId}`
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamodb.update(params).promise();
  return result.Attributes;
};

// Delete carousel item (admin)
exports.deleteCarouselItem = async (itemId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CAROUSEL',
      SK: `ITEM#${itemId}`
    },
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamodb.delete(params).promise();
  if (!result.Attributes) {
    throw new Error('Carousel item not found');
  }

  return { deleted: true, item: result.Attributes };
};

// Reorder carousel items (admin)
exports.reorderCarouselItems = async (itemOrders) => {
  const now = new Date().toISOString();
  
  // Build transaction items for all carousel updates
  const transactItems = itemOrders.map(({ itemId, position }) => ({
    Update: {
      TableName: TABLE_NAME,
      Key: {
        PK: 'CAROUSEL',
        SK: `ITEM#${itemId}`
      },
      UpdateExpression: 'SET #position = :position, UpdatedAt = :now, GSI1SK = :gsi1sk',
      ExpressionAttributeNames: {
        '#position': 'Position'
      },
      ExpressionAttributeValues: {
        ':position': position,
        ':now': now,
        ':gsi1sk': String(position).padStart(3, '0')
      }
    }
  }));

  // Execute in batches of 25 (DynamoDB transaction limit)
  const batches = [];
  for (let i = 0; i < transactItems.length; i += 25) {
    batches.push(transactItems.slice(i, i + 25));
  }

  for (const batch of batches) {
    const transactParams = {
      TransactItems: batch
    };
    await dynamodb.transactWrite(transactParams).promise();
  }

  return { reordered: itemOrders.length };
};

// Increment view count
exports.incrementViewCount = async (itemId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CAROUSEL',
      SK: `ITEM#${itemId}`
    },
    UpdateExpression: 'ADD ViewCount :inc',
    ExpressionAttributeValues: {
      ':inc': 1
    }
  };

  await dynamodb.update(params).promise();
};

// Increment click count
exports.incrementClickCount = async (itemId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CAROUSEL',
      SK: `ITEM#${itemId}`
    },
    UpdateExpression: 'ADD ClickCount :inc',
    ExpressionAttributeValues: {
      ':inc': 1
    }
  };

  await dynamodb.update(params).promise();
};

// Get carousel analytics (admin)
exports.getCarouselAnalytics = async () => {
  const items = await exports.getAllCarouselItems();
  
  const analytics = items.map(item => ({
    itemId: item.ItemId,
    title: item.Title,
    status: item.Status,
    position: item.Position,
    viewCount: item.ViewCount || 0,
    clickCount: item.ClickCount || 0,
    clickThroughRate: item.ViewCount > 0 
      ? ((item.ClickCount || 0) / item.ViewCount * 100).toFixed(2)
      : '0.00',
    createdAt: item.CreatedAt,
    updatedAt: item.UpdatedAt
  }));

  const totalViews = analytics.reduce((sum, item) => sum + item.viewCount, 0);
  const totalClicks = analytics.reduce((sum, item) => sum + item.clickCount, 0);
  const overallCTR = totalViews > 0 ? (totalClicks / totalViews * 100).toFixed(2) : '0.00';

  return {
    items: analytics,
    summary: {
      totalItems: items.length,
      activeItems: items.filter(item => item.Status === 'active').length,
      totalViews,
      totalClicks,
      overallClickThroughRate: overallCTR
    }
  };
};
