import https from 'https';
import http from 'http';
import { Logger } from './logger.js';

export class IpDetector {
  private static readonly TIMEOUT = 5000; // 5 seconds
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

  static async getCurrentIp(): Promise<string> {
    Logger.debug('Starting IP detection');
    
    // Try primary service first
    try {
      const ip = await this.fetchFromIpify();
      Logger.logIpCheck({
        success: true,
        currentIp: ip,
        context: { service: 'ipify', primary: true }
      });
      console.log('IP detected via ipify:', ip);
      return ip;
    } catch (error) {
      Logger.warn('Primary IP service (ipify) failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        service: 'ipify'
      });
      console.warn('Primary IP service failed:', error);
    }

    // Fallback to secondary service
    try {
      const ip = await this.fetchFromIcanhazip();
      Logger.logIpCheck({
        success: true,
        currentIp: ip,
        context: { service: 'icanhazip', fallback: true }
      });
      console.log('IP detected via icanhazip:', ip);
      return ip;
    } catch (error) {
      const errorMsg = 'All IP detection services failed';
      Logger.logIpCheck({
        success: false,
        error: errorMsg,
        context: { 
          primaryError: 'ipify failed',
          fallbackError: error instanceof Error ? error.message : 'Unknown error',
          services: ['ipify', 'icanhazip']
        }
      });
      console.error('All IP detection services failed:', error);
      throw new Error('Failed to detect IP address');
    }
  }

  private static async fetchFromIpify(): Promise<string> {
    return this.retryOperation(() => this.httpRequest('https://api.ipify.org?format=json'));
  }

  private static async fetchFromIcanhazip(): Promise<string> {
    return this.retryOperation(() => this.httpRequest('https://icanhazip.com'));
  }

  private static async retryOperation(operation: () => Promise<string>): Promise<string> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.MAX_RETRIES) {
          const delay = this.RETRY_DELAYS[attempt];
          console.log(`Retry attempt ${attempt + 1} in ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private static httpRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;

      const request = client.get(url, {
        timeout: this.TIMEOUT
      }, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            return;
          }

          try {
            // Handle different response formats
            if (url.includes('ipify')) {
              const parsed = JSON.parse(data);
              const ip = parsed.ip?.trim();
              if (!ip) throw new Error('No IP in response');
              resolve(ip);
            } else {
              // icanhazip returns plain text
              const ip = data.trim();
              if (!ip) throw new Error('Empty response');
              resolve(ip);
            }
          } catch (error) {
            reject(new Error(`Invalid response format: ${error}`));
          }
        });
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error(`Request timeout after ${this.TIMEOUT}ms`));
      });

      request.on('error', (error) => {
        reject(error);
      });
    });
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}