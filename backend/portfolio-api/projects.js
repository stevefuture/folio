const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;

// Get all published projects (public)
exports.getPublishedProjects = async () => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :status',
    ExpressionAttributeValues: {
      ':status': 'PROJECT#STATUS#published'
    },
    ScanIndexForward: false // Most recent first
  };

  const result = await dynamodb.query(params).promise();
  return result.Items.filter(item => item.IsVisible);
};

// Get all projects (admin)
exports.getAllProjects = async () => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'PROJECT'
    },
    ScanIndexForward: false
  };

  const result = await dynamodb.query(params).promise();
  return result.Items;
};

// Get project by ID with images
exports.getProjectById = async (projectId) => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `PROJECT#${projectId}`
    }
  };

  const result = await dynamodb.query(params).promise();
  
  if (result.Items.length === 0) {
    throw new Error('Project not found');
  }

  // Separate project and images
  const project = result.Items.find(item => item.EntityType === 'Project');
  const images = result.Items
    .filter(item => item.EntityType === 'Image')
    .sort((a, b) => a.SortOrder - b.SortOrder);

  return {
    ...project,
    images
  };
};

// Get projects by category
exports.getProjectsByCategory = async (category) => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :category',
    ExpressionAttributeValues: {
      ':category': `PROJECT#CATEGORY#${category}`
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

// Create new project (admin)
exports.createProject = async (projectData) => {
  const projectId = projectData.projectId || projectData.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const now = new Date().toISOString();
  const datePrefix = now.split('T')[0];

  const project = {
    PK: 'PROJECT',
    SK: `PROJECT#${datePrefix}#${projectId}`,
    GSI1PK: `PROJECT#STATUS#${projectData.status || 'draft'}`,
    GSI1SK: now,
    GSI2PK: `PROJECT#CATEGORY#${projectData.category}`,
    GSI2SK: now,
    EntityType: 'Project',
    ProjectId: projectId,
    Title: projectData.title,
    Description: projectData.description || '',
    Category: projectData.category,
    Status: projectData.status || 'draft',
    FeaturedImage: projectData.featuredImage || '',
    CoverImage: projectData.coverImage || '',
    Tags: projectData.tags || [],
    Location: projectData.location || '',
    CreatedAt: now,
    UpdatedAt: now,
    PublishedAt: projectData.status === 'published' ? now : null,
    SortOrder: projectData.sortOrder || 0,
    IsVisible: projectData.isVisible !== false,
    ImageCount: 0,
    ViewCount: 0,
    Metadata: projectData.metadata || {}
  };

  const params = {
    TableName: TABLE_NAME,
    Item: project,
    ConditionExpression: 'attribute_not_exists(PK)'
  };

  await dynamodb.put(params).promise();
  return project;
};

// Update project (admin)
exports.updateProject = async (projectId, updates) => {
  const now = new Date().toISOString();
  
  // Build update expression
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  Object.keys(updates).forEach(key => {
    if (key !== 'projectId' && updates[key] !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = updates[key];
    }
  });
  
  // Always update UpdatedAt
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'UpdatedAt';
  expressionAttributeValues[':updatedAt'] = now;
  
  // Update GSI keys if status or category changed
  if (updates.status) {
    updateExpressions.push('#gsi1pk = :gsi1pk');
    expressionAttributeNames['#gsi1pk'] = 'GSI1PK';
    expressionAttributeValues[':gsi1pk'] = `PROJECT#STATUS#${updates.status}`;
  }
  
  if (updates.category) {
    updateExpressions.push('#gsi2pk = :gsi2pk');
    expressionAttributeNames['#gsi2pk'] = 'GSI2PK';
    expressionAttributeValues[':gsi2pk'] = `PROJECT#CATEGORY#${updates.category}`;
  }

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'PROJECT',
      SK: `PROJECT#${projectId}`
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamodb.update(params).promise();
  return result.Attributes;
};

// Delete project (admin)
exports.deleteProject = async (projectId) => {
  // First get all items for this project
  const queryParams = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `PROJECT#${projectId}`
    }
  };

  const result = await dynamodb.query(queryParams).promise();
  
  if (result.Items.length === 0) {
    throw new Error('Project not found');
  }

  // Delete all items (project + images)
  const deleteRequests = result.Items.map(item => ({
    DeleteRequest: {
      Key: {
        PK: item.PK,
        SK: item.SK
      }
    }
  }));

  // Batch delete (max 25 items per batch)
  const batches = [];
  for (let i = 0; i < deleteRequests.length; i += 25) {
    batches.push(deleteRequests.slice(i, i + 25));
  }

  for (const batch of batches) {
    const batchParams = {
      RequestItems: {
        [TABLE_NAME]: batch
      }
    };
    await dynamodb.batchWrite(batchParams).promise();
  }

  return { deleted: result.Items.length };
};
