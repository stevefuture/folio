import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Generate nonce for CSP
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

// Environment-specific CSP configurations
const CSP_CONFIGS = {
  production: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'nonce-{NONCE}'",
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com'
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for CSS-in-JS libraries
      'https://fonts.googleapis.com'
    ],
    'img-src': [
      "'self'",
      'data:',
      'https:',
      'blob:',
      process.env.NEXT_PUBLIC_IMAGE_DOMAIN || ''
    ],
    'font-src': [
      "'self'",
      'https://fonts.gstatic.com'
    ],
    'connect-src': [
      "'self'",
      'https://*.amazonaws.com',
      process.env.NEXT_PUBLIC_API_URL || '',
      'https://www.google-analytics.com'
    ],
    'media-src': [
      "'self'",
      process.env.NEXT_PUBLIC_IMAGE_DOMAIN || ''
    ],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
    'report-uri': ['/api/csp-report']
  },
  
  staging: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'nonce-{NONCE}'",
      "'unsafe-eval'", // Allow for development tools
      'https://www.googletagmanager.com'
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com'
    ],
    'img-src': [
      "'self'",
      'data:',
      'https:',
      'blob:'
    ],
    'font-src': [
      "'self'",
      'https://fonts.gstatic.com'
    ],
    'connect-src': [
      "'self'",
      'https://*.amazonaws.com',
      process.env.NEXT_PUBLIC_API_URL || ''
    ],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'report-uri': ['/api/csp-report']
  },
  
  development: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-eval'",
      "'unsafe-inline'",
      'localhost:*',
      '127.0.0.1:*'
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'"
    ],
    'img-src': [
      "'self'",
      'data:',
      'https:',
      'blob:',
      'localhost:*',
      '127.0.0.1:*'
    ],
    'font-src': [
      "'self'",
      'data:'
    ],
    'connect-src': [
      "'self'",
      'ws:',
      'wss:',
      'localhost:*',
      '127.0.0.1:*',
      'https:'
    ],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"]
  }
};

// Generate CSP header value
export function generateCSPHeader(environment: string = 'production', nonce?: string): string {
  const config = CSP_CONFIGS[environment as keyof typeof CSP_CONFIGS] || CSP_CONFIGS.production;
  
  const directives = Object.entries(config).map(([directive, sources]) => {
    if (sources.length === 0) {
      return directive;
    }
    
    const processedSources = sources.map(source => {
      if (nonce && source.includes('{NONCE}')) {
        return source.replace('{NONCE}', nonce);
      }
      return source;
    }).filter(Boolean);
    
    return `${directive} ${processedSources.join(' ')}`;
  });
  
  return directives.join('; ');
}

// Comprehensive security headers
export function getSecurityHeaders(environment: string = 'production', nonce?: string): Record<string, string> {
  const isProduction = environment === 'production';
  
  return {
    // Content Security Policy
    'Content-Security-Policy': generateCSPHeader(environment, nonce),
    
    // Strict Transport Security
    'Strict-Transport-Security': isProduction 
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=31536000; includeSubDomains',
    
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',
    
    // XSS Protection (legacy but still useful)
    'X-XSS-Protection': '1; mode=block',
    
    // Referrer Policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions Policy (Feature Policy)
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()'
    ].join(', '),
    
    // Cross-Origin Policies
    'Cross-Origin-Embedder-Policy': isProduction ? 'require-corp' : 'unsafe-none',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    
    // Cache Control for security-sensitive responses
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    
    // Custom security headers
    'X-Robots-Tag': isProduction ? 'index, follow' : 'noindex, nofollow',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-Download-Options': 'noopen'
  };
}

// Middleware for applying security headers
export function securityHeadersMiddleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'production';
  
  // Generate nonce for this request
  const nonce = generateNonce();
  
  // Get security headers
  const headers = getSecurityHeaders(environment, nonce);
  
  // Apply headers to response
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Store nonce for use in components
  response.headers.set('X-Nonce', nonce);
  
  return response;
}

// CSP violation reporting endpoint handler
export async function handleCSPReport(request: Request): Promise<Response> {
  try {
    const report = await request.json();
    
    // Log CSP violation
    console.error('CSP Violation Report:', {
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      report: report['csp-report']
    });
    
    // In production, you might want to send this to a monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Send to monitoring service (CloudWatch, Sentry, etc.)
      await sendToMonitoringService(report);
    }
    
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error processing CSP report:', error);
    return new Response('Error', { status: 500 });
  }
}

// Send CSP violations to monitoring service
async function sendToMonitoringService(report: any): Promise<void> {
  // Example: Send to CloudWatch Logs
  try {
    const AWS = require('aws-sdk');
    const cloudWatchLogs = new AWS.CloudWatchLogs();
    
    await cloudWatchLogs.putLogEvents({
      logGroupName: '/security/csp-violations',
      logStreamName: new Date().toISOString().split('T')[0],
      logEvents: [{
        timestamp: Date.now(),
        message: JSON.stringify({
          type: 'csp-violation',
          report: report['csp-report'],
          timestamp: new Date().toISOString()
        })
      }]
    }).promise();
  } catch (error) {
    console.error('Failed to send CSP report to monitoring:', error);
  }
}

// Security headers for API routes
export function getAPISecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}

// Rate limiting headers
export function getRateLimitHeaders(limit: number, remaining: number, resetTime: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': resetTime.toString(),
    'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString()
  };
}

// CORS headers for API endpoints
export function getCORSHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_SITE_URL,
    'https://yourdomain.com',
    'https://staging.yourdomain.com'
  ].filter(Boolean);
  
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
