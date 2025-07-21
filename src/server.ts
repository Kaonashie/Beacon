import express from 'express';
import path from 'path';
import fs from 'fs';
import { Config, UpdateHistory } from './types/index.js';
import { IpMonitor } from './services/ipMonitor.js';
import { StorageService } from './services/storage.js';
import { Logger } from './services/logger.js';
import { SecurityService } from './services/security.js';

// Load environment variables from .env file
import { config } from 'dotenv';
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Global IP monitor instance
const ipMonitor = new IpMonitor();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting
const rateLimiter = SecurityService.createRateLimiter();
app.use('/api/', rateLimiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    Logger.logApiRequest(req.method, req.path, res.statusCode, duration);
  });
  
  next();
});

// Initialize data directory and files
function initializeDataFiles(): void {
  const dataDir = path.join(__dirname, '../data');
  const configPath = path.join(dataDir, 'config.json');
  const historyPath = path.join(dataDir, 'history.json');

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory');
  }

  // Create default config.json if it doesn't exist
  if (!fs.existsSync(configPath)) {
    const defaultConfig: Config = {
      checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || '10'),
      theme: 'light',
      lastKnownIp: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log('Created default config.json');
  }

  // Create default history.json if it doesn't exist
  if (!fs.existsSync(historyPath)) {
    const defaultHistory: UpdateHistory = {
      updates: []
    };
    fs.writeFileSync(historyPath, JSON.stringify(defaultHistory, null, 2));
    console.log('Created default history.json');
  }
}

// Validate environment variables
function validateEnvironment(): void {
  const required = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID', 'DNS_RECORD_NAME'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    const error = `Missing required environment variables: ${missing.join(', ')}`;
    Logger.error(error, undefined, { missing, envFile: '.env' });
    console.error(error);
    console.error('Please check your .env file');
    process.exit(1);
  }
  
  Logger.info('Environment validation passed', {
    hasToken: !!process.env.CLOUDFLARE_API_TOKEN,
    hasZoneId: !!process.env.CLOUDFLARE_ZONE_ID,
    dnsRecord: process.env.DNS_RECORD_NAME,
    port: process.env.PORT || 3000,
    checkInterval: process.env.CHECK_INTERVAL_MINUTES || 10
  });
}

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    lastIpCheck: new Date().toISOString()
  });
});

// API endpoint for current status
app.get('/api/status', (req, res) => {
  try {
    const config = StorageService.readConfig();
    const status = ipMonitor.getStatus();
    const nextCheck = ipMonitor.getNextCheckTime();
    
    res.json({
      currentIp: SecurityService.obfuscateIp(config.lastKnownIp),
      lastUpdate: config.updatedAt,
      status: status,
      nextCheck: nextCheck.toISOString(),
      dnsRecordName: process.env.DNS_RECORD_NAME,
      checkIntervalMinutes: config.checkIntervalMinutes,
      theme: config.theme
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
      details: SecurityService.sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error')
    });
  }
});

// API endpoint for update history
app.get('/api/history', (req, res) => {
  try {
    const history = StorageService.readHistory();
    // Obfuscate IPs in history
    const sanitizedHistory = {
      updates: history.updates.map(update => ({
        ...update,
        oldIp: SecurityService.obfuscateIp(update.oldIp),
        newIp: SecurityService.obfuscateIp(update.newIp)
      }))
    };
    res.json(sanitizedHistory);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get history',
      details: SecurityService.sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error')
    });
  }
});

// API endpoint for updating settings
app.put('/api/settings', (req, res) => {
  try {
    const { checkIntervalMinutes, theme } = req.body;
    
    // Validate input
    if (!SecurityService.validateSettingsInput(req.body)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input parameters'
      });
    }
    
    // Validate interval
    if (checkIntervalMinutes && (checkIntervalMinutes < 1 || checkIntervalMinutes > 60)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid interval. Must be between 1 and 60 minutes.'
      });
    }
    
    // Validate theme
    if (theme && !['light', 'dark'].includes(theme)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid theme. Must be "light" or "dark".'
      });
    }
    
    // Update config
    const config = StorageService.readConfig();
    if (checkIntervalMinutes) config.checkIntervalMinutes = checkIntervalMinutes;
    if (theme) config.theme = theme;
    
    StorageService.writeConfig(config);
    
    // Restart IP monitor with new interval
    if (checkIntervalMinutes) {
      ipMonitor.stop();
      ipMonitor.start();
    }
    
    res.json({
      success: true,
      message: 'Settings updated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
      details: SecurityService.sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error')
    });
  }
});

// API endpoint for force update
app.post('/api/force-update', async (req, res) => {
  try {
    const result = await ipMonitor.forceCheck();
    
    // Obfuscate IP in response
    const sanitizedResult = {
      ...result,
      currentIp: SecurityService.obfuscateIp(result.currentIp)
    };
    
    if (result.success) {
      res.json(sanitizedResult);
    } else {
      res.status(500).json(sanitizedResult);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      ipChanged: false,
      currentIp: null,
      message: SecurityService.sanitizeErrorMessage(error instanceof Error ? error.message : 'Unknown error')
    });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API endpoint for logs (debug) - restricted access
app.get('/api/logs/error', (req, res) => {
  // Check for debug access (only localhost in production)
  if (!SecurityService.isDebugAccessAllowed(req)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const lines = Math.min(parseInt(req.query.lines as string) || 50, 200); // Limit max lines
    const content = Logger.getErrorLogContent(lines);
    // Sanitize log content to remove sensitive information
    const sanitizedContent = SecurityService.sanitizeLogContent(content);
    res.setHeader('Content-Type', 'text/plain');
    res.send(sanitizedContent);
  } catch (error) {
    Logger.error('Failed to retrieve error logs', error as Error);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

app.get('/api/logs/app', (req, res) => {
  // Check for debug access (only localhost in production)
  if (!SecurityService.isDebugAccessAllowed(req)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const lines = Math.min(parseInt(req.query.lines as string) || 100, 200); // Limit max lines
    const content = Logger.getAppLogContent(lines);
    // Sanitize log content to remove sensitive information
    const sanitizedContent = SecurityService.sanitizeLogContent(content);
    res.setHeader('Content-Type', 'text/plain');
    res.send(sanitizedContent);
  } catch (error) {
    Logger.error('Failed to retrieve app logs', error as Error);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Start server
function startServer(): void {
  // Initialize logger first
  Logger.init();
  
  validateEnvironment();
  initializeDataFiles();
  
  app.listen(PORT, () => {
    const startupInfo = {
      port: PORT,
      dnsRecord: process.env.DNS_RECORD_NAME,
      checkInterval: process.env.CHECK_INTERVAL_MINUTES || 10,
      nodeEnv: process.env.NODE_ENV || 'development'
    };
    
    Logger.info('Beacon service started', startupInfo);
    console.log(`Beacon service running on port ${PORT}`);
    console.log(`DNS record: ${process.env.DNS_RECORD_NAME}`);
    console.log(`Check interval: ${process.env.CHECK_INTERVAL_MINUTES || 10} minutes`);
    
    // Start IP monitoring
    ipMonitor.start();
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  ipMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  ipMonitor.stop();
  process.exit(0);
});

startServer();