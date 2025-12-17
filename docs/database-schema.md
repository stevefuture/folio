# DynamoDB Schema Design

## Single Table Design

Using a single DynamoDB table with composite keys for optimal performance and cost efficiency.

### Table Structure

**Table Name**: `PhotographyPortfolio`
- **Partition Key (PK)**: String
- **Sort Key (SK)**: String
- **Billing Mode**: On-Demand
- **Point-in-Time Recovery**: Enabled

## Entity Schemas

### 1. Projects

**Access Patterns**:
- Get all projects (public)
- Get project by ID with images
- Get projects by category
- Get projects by status (admin)
- Get projects by date range

**Schema**:
```json
{
  "PK": "PROJECT",
  "SK": "PROJECT#2024-01-15#landscape-series",
  "GSI1PK": "PROJECT#STATUS#published",
  "GSI1SK": "2024-01-15T10:30:00Z",
  "GSI2PK": "PROJECT#CATEGORY#landscape", 
  "GSI2SK": "2024-01-15T10:30:00Z",
  "EntityType": "Project",
  "ProjectId": "landscape-series",
  "Title": "Mountain Landscapes",
  "Description": "A collection of breathtaking mountain photography",
  "Category": "landscape",
  "Status": "published",
  "FeaturedImage": "projects/landscape-series/hero.jpg",
  "CoverImage": "projects/landscape-series/cover.jpg",
  "Tags": ["mountains", "nature", "landscape"],
  "Location": "Rocky Mountains, Colorado",
  "CreatedAt": "2024-01-15T10:30:00Z",
  "UpdatedAt": "2024-01-15T10:30:00Z",
  "PublishedAt": "2024-01-15T12:00:00Z",
  "SortOrder": 1,
  "IsVisible": true,
  "ImageCount": 12,
  "ViewCount": 0,
  "Metadata": {
    "camera": "Canon EOS R5",
    "lens": "24-70mm f/2.8",
    "shootDate": "2024-01-10"
  }
}
```

### 2. Images

**Access Patterns**:
- Get all images for a project
- Get image by ID
- Get images by upload date
- Get images by status (admin)
- Get featured images across projects

**Schema**:
```json
{
  "PK": "PROJECT#landscape-series",
  "SK": "IMAGE#001#mountain-peak.jpg",
  "GSI1PK": "IMAGE#STATUS#published",
  "GSI1SK": "2024-01-15T11:00:00Z",
  "GSI2PK": "IMAGE#FEATURED#true",
  "GSI2SK": "2024-01-15T11:00:00Z",
  "EntityType": "Image",
  "ImageId": "mountain-peak.jpg",
  "ProjectId": "landscape-series",
  "Title": "Mountain Peak at Sunrise",
  "Description": "Golden hour light illuminating the mountain peak",
  "FileName": "mountain-peak.jpg",
  "FilePath": "projects/landscape-series/mountain-peak.jpg",
  "ThumbnailPath": "projects/landscape-series/thumbs/mountain-peak.jpg",
  "FileSize": 2048576,
  "Dimensions": {
    "width": 3840,
    "height": 2160
  },
  "Format": "JPEG",
  "Status": "published",
  "SortOrder": 1,
  "IsFeatured": true,
  "IsVisible": true,
  "Tags": ["sunrise", "peak", "golden-hour"],
  "Location": "Mount Elbert, Colorado",
  "CreatedAt": "2024-01-15T11:00:00Z",
  "UpdatedAt": "2024-01-15T11:00:00Z",
  "PublishedAt": "2024-01-15T12:00:00Z",
  "ViewCount": 0,
  "ExifData": {
    "camera": "Canon EOS R5",
    "lens": "24-70mm f/2.8",
    "focalLength": "35mm",
    "aperture": "f/8",
    "shutterSpeed": "1/125",
    "iso": 100,
    "dateTaken": "2024-01-10T06:30:00Z"
  },
  "ColorPalette": ["#FF6B35", "#F7931E", "#FFD23F", "#06FFA5", "#118AB2"]
}
```

### 3. Carousel Configuration

**Access Patterns**:
- Get active carousel items (public)
- Get all carousel configurations (admin)
- Get carousel by position/order

**Schema**:
```json
{
  "PK": "CAROUSEL",
  "SK": "ITEM#001#hero-slide",
  "GSI1PK": "CAROUSEL#STATUS#active",
  "GSI1SK": "001",
  "EntityType": "CarouselItem",
  "ItemId": "hero-slide",
  "Title": "Mountain Landscapes Collection",
  "Subtitle": "Capturing Nature's Majesty",
  "Description": "Explore breathtaking mountain vistas and alpine scenery",
  "ImagePath": "carousel/hero-mountain.jpg",
  "MobileImagePath": "carousel/hero-mountain-mobile.jpg",
  "LinkType": "project",
  "LinkTarget": "landscape-series",
  "LinkUrl": "/projects/landscape-series",
  "ButtonText": "View Collection",
  "Position": 1,
  "Status": "active",
  "IsVisible": true,
  "DisplayDuration": 5000,
  "TransitionType": "fade",
  "TextPosition": "center-left",
  "TextColor": "#FFFFFF",
  "OverlayOpacity": 0.3,
  "CreatedAt": "2024-01-15T09:00:00Z",
  "UpdatedAt": "2024-01-15T09:00:00Z",
  "ScheduledStart": null,
  "ScheduledEnd": null,
  "ViewCount": 0,
  "ClickCount": 0
}
```

### 4. Site Configuration

**Access Patterns**:
- Get site settings
- Get contact information
- Get SEO metadata

**Schema**:
```json
{
  "PK": "CONFIG",
  "SK": "SITE#general",
  "EntityType": "SiteConfig",
  "ConfigType": "general",
  "SiteName": "John Doe Photography",
  "Tagline": "Capturing Life's Beautiful Moments",
  "Description": "Professional photographer specializing in landscapes and portraits",
  "ContactEmail": "hello@johndoephotography.com",
  "Phone": "+1-555-0123",
  "Address": "Denver, Colorado, USA",
  "SocialMedia": {
    "instagram": "@johndoephoto",
    "facebook": "johndoephotography",
    "twitter": "@johndoephoto"
  },
  "SEO": {
    "metaTitle": "John Doe Photography - Professional Photographer",
    "metaDescription": "Award-winning photographer capturing stunning landscapes and portraits",
    "keywords": ["photography", "landscape", "portrait", "colorado"],
    "ogImage": "assets/og-image.jpg"
  },
  "Analytics": {
    "googleAnalyticsId": "GA-XXXXXXXXX",
    "facebookPixelId": null
  },
  "UpdatedAt": "2024-01-15T08:00:00Z"
}
```

## Global Secondary Indexes (GSI)

### GSI1: Status and Date Index
- **Partition Key**: GSI1PK (Status-based queries)
- **Sort Key**: GSI1SK (Date/timestamp for sorting)
- **Use Cases**:
  - Get published projects by date
  - Get active carousel items
  - Get published images by upload date

### GSI2: Category and Feature Index  
- **Partition Key**: GSI2PK (Category/feature-based queries)
- **Sort Key**: GSI2SK (Date/order for sorting)
- **Use Cases**:
  - Get projects by category
  - Get featured images
  - Get items by type and date

## Access Patterns Implementation

### Public API Patterns

1. **Get All Published Projects**
   ```
   Query: PK = "PROJECT", SK begins_with "PROJECT#"
   Filter: Status = "published" AND IsVisible = true
   ```

2. **Get Project with Images**
   ```
   Query: PK = "PROJECT#{projectId}"
   Returns: Project + all associated images
   ```

3. **Get Active Carousel Items**
   ```
   Query: GSI1PK = "CAROUSEL#STATUS#active"
   Sort: GSI1SK (position)
   ```

4. **Get Projects by Category**
   ```
   Query: GSI2PK = "PROJECT#CATEGORY#{category}"
   Sort: GSI2SK (date descending)
   ```

### Admin API Patterns

5. **Get All Projects (Any Status)**
   ```
   Query: PK = "PROJECT"
   No status filter
   ```

6. **Get Images by Status**
   ```
   Query: GSI1PK = "IMAGE#STATUS#{status}"
   Sort: GSI1SK (date)
   ```

7. **Get Featured Images**
   ```
   Query: GSI2PK = "IMAGE#FEATURED#true"
   Sort: GSI2SK (date)
   ```

## Key Design Decisions

### 1. Single Table Design
- **Benefits**: Lower cost, better performance, atomic transactions
- **Trade-offs**: More complex queries, careful key design required

### 2. Composite Sort Keys
- **Format**: `ENTITY#DATE#ID` or `ENTITY#ORDER#ID`
- **Benefits**: Natural sorting, hierarchical queries
- **Example**: `PROJECT#2024-01-15#landscape-series`

### 3. Overloaded GSIs
- **GSI1**: Status and temporal queries
- **GSI2**: Category and feature queries
- **Benefits**: Flexible querying with minimal indexes

### 4. Denormalization
- **Project**: Includes `ImageCount` for quick display
- **Image**: Includes `ProjectId` for reverse lookups
- **Benefits**: Fewer queries, better performance

## Query Examples

### Get Homepage Data (Single Query)
```javascript
// Get carousel items and featured projects
const params = {
  RequestItems: {
    'PhotographyPortfolio': {
      Keys: [
        { PK: 'CAROUSEL', SK: 'ITEM#001#hero-slide' },
        { PK: 'CAROUSEL', SK: 'ITEM#002#portfolio-slide' },
        { PK: 'PROJECT', SK: 'PROJECT#2024-01-15#landscape-series' }
      ]
    }
  }
};
```

### Get Project Gallery
```javascript
// Get project and all images in one query
const params = {
  TableName: 'PhotographyPortfolio',
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: {
    ':pk': 'PROJECT#landscape-series'
  }
};
```

This schema design optimizes for both read performance and cost efficiency while supporting all required access patterns for a photography portfolio website.
