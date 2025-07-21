import fs from 'fs';
import path from 'path';

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

export class Logger {
  private static logDir = path.join(__dirname, '../../logs');
  private static errorLogPath = path.join(this.logDir, 'error.log');
  private static appLogPath = path.join(this.logDir, 'app.log');

  static init(): void {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log('Created logs directory');
    }
  }

  private static formatMessage(level: LogLevel, message: string, error?: Error, context?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
    const errorStr = error ? ` | Error: ${error.message} | Stack: ${error.stack}` : '';
    
    return `[${timestamp}] ${level}: ${message}${contextStr}${errorStr}\n`;
  }

  private static writeToFile(filePath: string, message: string): void {
    try {
      fs.appendFileSync(filePath, message);
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  static error(message: string, error?: Error, context?: any): void {
    const logMessage = this.formatMessage(LogLevel.ERROR, message, error, context);
    
    // Write to error log
    this.writeToFile(this.errorLogPath, logMessage);
    
    // Also write to app log
    this.writeToFile(this.appLogPath, logMessage);
    
    // Console output for immediate visibility
    console.error(`🔴 ERROR: ${message}`, error || '', context || '');
  }

  static warn(message: string, context?: any): void {
    const logMessage = this.formatMessage(LogLevel.WARN, message, undefined, context);
    
    this.writeToFile(this.appLogPath, logMessage);
    console.warn(`🟡 WARN: ${message}`, context || '');
  }

  static info(message: string, context?: any): void {
    const logMessage = this.formatMessage(LogLevel.INFO, message, undefined, context);
    
    this.writeToFile(this.appLogPath, logMessage);
    console.log(`🔵 INFO: ${message}`, context || '');
  }

  static debug(message: string, context?: any): void {
    const logMessage = this.formatMessage(LogLevel.DEBUG, message, undefined, context);
    
    this.writeToFile(this.appLogPath, logMessage);
    
    // Only show debug in development
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`🟣 DEBUG: ${message}`, context || '');
    }
  }

  static logIpCheck(result: { success: boolean; currentIp?: string; error?: string; context?: any }): void {
    const message = result.success 
      ? `IP check successful: ${result.currentIp}`
      : `IP check failed: ${result.error}`;
    
    if (result.success) {
      this.info(message, result.context);
    } else {
      this.error(message, undefined, { ...result.context, error: result.error });
    }
  }

  static logDnsUpdate(result: { success: boolean; ip?: string; recordName?: string; error?: string; context?: any }): void {
    const message = result.success
      ? `DNS update successful: ${result.recordName} -> ${result.ip}`
      : `DNS update failed: ${result.error}`;
    
    if (result.success) {
      this.info(message, result.context);
    } else {
      this.error(message, undefined, { 
        ...result.context, 
        recordName: result.recordName, 
        targetIp: result.ip,
        error: result.error 
      });
    }
  }

  static logApiRequest(method: string, path: string, status: number, duration: number, error?: string): void {
    const message = `${method} ${path} - ${status} (${duration}ms)`;
    
    if (status >= 400) {
      this.error(message, undefined, { method, path, status, duration, error });
    } else {
      this.info(message, { method, path, status, duration });
    }
  }

  static getErrorLogContent(lines: number = 50): string {
    try {
      if (!fs.existsSync(this.errorLogPath)) {
        return 'No error log file found';
      }
      
      const content = fs.readFileSync(this.errorLogPath, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      const recentLines = allLines.slice(-lines);
      
      return recentLines.join('\n');
    } catch (error) {
      return `Failed to read error log: ${error}`;
    }
  }

  static getAppLogContent(lines: number = 100): string {
    try {
      if (!fs.existsSync(this.appLogPath)) {
        return 'No app log file found';
      }
      
      const content = fs.readFileSync(this.appLogPath, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      const recentLines = allLines.slice(-lines);
      
      return recentLines.join('\n');
    } catch (error) {
      return `Failed to read app log: ${error}`;
    }
  }
}