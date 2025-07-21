import https from 'https';
import http from 'http';
import { Logger } from './logger.js';

export class IpDetector {
  private static readonly TIMEOUT = 10000; // 10 seconds (increased)
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s (increased)

  static async getCurrentIp(): Promise<string> {
    Logger.debug('Starting IP detection');
    
    const services = [
      { name: 'ipify', func: () => this.fetchFromIpify() },
      { name: 'icanhazip', func: () => this.fetchFromIcanhazip() },
      { name: 'httpbin', func: () => this.fetchFromHttpbin() },
      { name: 'ifconfig.me', func: () => this.fetchFromIfconfig() }
    ];

    let lastError: Error | null = null;

    // Try each service in order
    for (const service of services) {
      try {
        Logger.debug(`Trying IP detection via ${service.name}`);
        const ip = await service.func();
        
        Logger.logIpCheck({
          success: true,
          currentIp: ip,
          context: { service: service.name, attempt: services.indexOf(service) + 1 }
        });
        console.log(`IP detected via ${service.name}:`, ip);
        return ip;
      } catch (error) {
        lastError = error as Error;
        Logger.warn(`IP service ${service.name} failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: service.name,
          attempt: services.indexOf(service) + 1
        });
        console.warn(`IP service ${service.name} failed:`, error);
        
        // Add delay between service attempts to avoid overwhelming
        if (services.indexOf(service) < services.length - 1) {
          await this.sleep(1000);
        }
      }
    }

    const errorMsg = 'All IP detection services failed';
    Logger.logIpCheck({
      success: false,
      error: errorMsg,
      context: { 
        servicesAttempted: services.map(s => s.name),
        lastError: lastError?.message || 'Unknown error',
        totalServices: services.length
      }
    });
    console.error('All IP detection services failed. Last error:', lastError);
    throw new Error('Failed to detect IP address from all services');
  }

  private static async fetchFromIpify(): Promise<string> {
    return this.retryOperation(() => this.httpRequest('https://api.ipify.org?format=json'));
  }

  private static async fetchFromIcanhazip(): Promise<string> {
    return this.retryOperation(() => this.httpRequest('https://icanhazip.com'));
  }

  private static async fetchFromHttpbin(): Promise<string> {
    return this.retryOperation(() => this.httpRequest('https://httpbin.org/ip'));
  }

  private static async fetchFromIfconfig(): Promise<string> {
    return this.retryOperation(() => this.httpRequest('https://ifconfig.me/ip'));
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
            } else if (url.includes('httpbin')) {
              const parsed = JSON.parse(data);
              const ip = parsed.origin?.trim();
              if (!ip) throw new Error('No IP in response');
              resolve(ip);
            } else {
              // icanhazip, ifconfig.me return plain text
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