import { Request } from 'express';

export class SecurityService {
  // In-memory rate limiting store (use Redis in production)
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  /**
   * Obfuscate IP address for privacy - show only first and last octet
   */
  static obfuscateIp(ip: string | null): string {
    if (!ip || ip === 'check_failed') {
      return ip || 'Unknown';
    }

    // Handle IPv4
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.xxx.xxx.${parts[3]}`;
      }
    }

    // Handle IPv6 (basic obfuscation)
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length >= 2) {
        return `${parts[0]}:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:${parts[parts.length - 1]}`;
      }
    }

    return 'xxx.xxx.xxx.xxx';
  }

  /**
   * Create rate limiter middleware
   */
  static createRateLimiter() {
    return (req: Request, res: any, next: any) => {
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      const windowMs = 15 * 60 * 1000; // 15 minutes
      const maxRequests = process.env.NODE_ENV === 'production' ? 100 : 1000; // Higher limit for development

      // Clean expired entries
      for (const [key, value] of this.rateLimitStore.entries()) {
        if (now > value.resetTime) {
          this.rateLimitStore.delete(key);
        }
      }

      const clientData = this.rateLimitStore.get(clientIp);
      
      if (!clientData || now > clientData.resetTime) {
        // New window
        this.rateLimitStore.set(clientIp, {
          count: 1,
          resetTime: now + windowMs
        });
        return next();
      }

      if (clientData.count >= maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Try again later.',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
      }

      clientData.count++;
      this.rateLimitStore.set(clientIp, clientData);
      next();
    };
  }

  /**
   * Validate settings input to prevent injection attacks
   */
  static validateSettingsInput(body: any): boolean {
    if (typeof body !== 'object' || body === null) {
      return false;
    }

    const allowedKeys = ['checkIntervalMinutes', 'theme'];
    const bodyKeys = Object.keys(body);

    // Check for unexpected keys
    for (const key of bodyKeys) {
      if (!allowedKeys.includes(key)) {
        return false;
      }
    }

    // Validate types
    if (body.checkIntervalMinutes !== undefined && typeof body.checkIntervalMinutes !== 'number') {
      return false;
    }

    if (body.theme !== undefined && typeof body.theme !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * Sanitize error messages to prevent information disclosure
   */
  static sanitizeErrorMessage(message: string): string {
    // Remove sensitive patterns
    const sensitivePatterns = [
      /\/home\/[^\/\s]+/g, // Home directory paths
      /\/var\/[^\/\s]+/g,  // Var directory paths
      /\/tmp\/[^\/\s]+/g,  // Temp directory paths
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses
      /Bearer\s+[A-Za-z0-9\-_]+/g, // API tokens
      /api_key[=:]\s*[A-Za-z0-9\-_]+/gi, // API keys
      /password[=:]\s*[^\s]+/gi, // Passwords
      /token[=:]\s*[A-Za-z0-9\-_]+/gi // Tokens
    ];

    let sanitized = message;
    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Limit message length
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 197) + '...';
    }

    return sanitized;
  }

  /**
   * Check if debug access is allowed (only localhost in production)
   */
  static isDebugAccessAllowed(req: Request): boolean {
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Allow in development
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    // In production, only allow localhost
    const localhostPatterns = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    return localhostPatterns.includes(clientIp || '');
  }

  /**
   * Sanitize log content to remove sensitive information
   */
  static sanitizeLogContent(content: string): string {
    // Remove sensitive patterns from logs
    const sensitivePatterns = [
      /Bearer\s+[A-Za-z0-9\-_]{20,}/g, // API tokens
      /api_key[=:]\s*[A-Za-z0-9\-_]{20,}/gi, // API keys
      /password[=:]\s*[^\s,}]+/gi, // Passwords
      /token[=:]\s*[A-Za-z0-9\-_]{20,}/gi, // Tokens
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // Full IP addresses
      /"content":\s*"[\d\.]+"/g, // IP addresses in JSON
      /CLOUDFLARE_[A-Z_]*=.*/g, // Environment variables
      /\/home\/[^\/\s]+/g, // Home directory paths
    ];

    let sanitized = content;
    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return sanitized;
  }

  /**
   * Validate file paths to prevent directory traversal
   */
  static isValidFilePath(filePath: string): boolean {
    // Prevent directory traversal
    if (filePath.includes('..') || filePath.includes('~')) {
      return false;
    }

    // Only allow specific file extensions in public directory
    const allowedExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
    const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    
    return allowedExtensions.includes(extension);
  }

  /**
   * Generate a secure session ID (for future authentication features)
   */
  static generateSecureId(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
}