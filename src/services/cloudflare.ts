import https from 'https';
import { Logger } from './logger.js';

interface CloudflareRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
}

interface CloudflareApiResponse {
  success: boolean;
  errors: any[];
  messages: any[];
  result: any;
}

export class CloudflareService {
  private static readonly BASE_URL = 'https://api.cloudflare.com/client/v4';
  private static readonly TIMEOUT = 5000;

  static async updateDnsRecord(newIp: string): Promise<boolean> {
    try {
      Logger.debug('Starting DNS record update process', {
        targetIp: newIp,
        recordName: process.env.DNS_RECORD_NAME,
        baseUrl: this.BASE_URL
      });
      
      // First, get the current DNS record
      const record = await this.getDnsRecord();
      
      if (!record) {
        const error = 'DNS record not found';
        Logger.error(error, undefined, {
          recordName: process.env.DNS_RECORD_NAME,
          zoneId: process.env.CLOUDFLARE_ZONE_ID
        });
        throw new Error(error);
      }

      Logger.debug('Found existing DNS record', {
        recordId: record.id,
        currentContent: record.content,
        recordType: record.type,
        recordName: record.name,
        proxied: record.proxied,
        ttl: record.ttl
      });

      // Update the record with new IP, preserving existing settings
      await this.updateRecord(record.id, newIp, record);
      
      Logger.info('DNS record updated successfully', {
        recordName: process.env.DNS_RECORD_NAME,
        oldIp: record.content,
        newIp: newIp,
        recordId: record.id
      });
      
      console.log(`DNS record updated: ${process.env.DNS_RECORD_NAME} -> ${newIp}`);
      return true;
    } catch (error) {
      Logger.error('Failed to update DNS record', error as Error, {
        targetIp: newIp,
        recordName: process.env.DNS_RECORD_NAME,
        zoneId: process.env.CLOUDFLARE_ZONE_ID
      });
      console.error('Failed to update DNS record:', error);
      return false;
    }
  }

  static async getDnsRecord(): Promise<CloudflareRecord | null> {
    try {
      const url = `${this.BASE_URL}/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records?name=${process.env.DNS_RECORD_NAME}&type=A`;
      
      const response = await this.makeRequest(url, 'GET');
      
      if (!response.success) {
        // Check if it's an auth error vs missing record
        if (response.errors && response.errors.length > 0) {
          const error = response.errors[0];
          if (error.code === 10001) {
            throw new Error('Invalid Cloudflare API credentials');
          } else if (error.code === 7003) {
            throw new Error('Invalid Zone ID or API access denied');
          }
        }
        Logger.warn('Cloudflare API returned error', {
          errors: response.errors,
          messages: response.messages
        });
        return null;
      }
      
      if (!response.result || response.result.length === 0) {
        Logger.info('No DNS records found for domain', {
          recordName: process.env.DNS_RECORD_NAME,
          recordType: 'A'
        });
        return null;
      }

      return response.result[0];
    } catch (error) {
      Logger.error('Failed to fetch DNS record', error as Error, {
        recordName: process.env.DNS_RECORD_NAME,
        zoneId: process.env.CLOUDFLARE_ZONE_ID
      });
      throw error;
    }
  }

  private static async updateRecord(recordId: string, newIp: string, existingRecord: CloudflareRecord): Promise<void> {
    const url = `${this.BASE_URL}/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`;
    
    // Preserve existing settings, only change the IP
    const payload = {
      type: existingRecord.type,
      name: existingRecord.name,
      content: newIp,
      ttl: existingRecord.ttl,
      proxied: existingRecord.proxied || false // Preserve proxy status
    };

    Logger.debug('Updating DNS record', {
      recordId,
      oldIp: existingRecord.content,
      newIp: newIp,
      preservedSettings: {
        proxied: payload.proxied,
        ttl: payload.ttl,
        type: payload.type
      }
    });

    const response = await this.makeRequest(url, 'PUT', payload);
    
    if (!response.success) {
      throw new Error(`Cloudflare API error: ${JSON.stringify(response.errors)}`);
    }
  }

  private static makeRequest(url: string, method: string, data?: any): Promise<CloudflareApiResponse> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const postData = data ? JSON.stringify(data) : undefined;

      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        timeout: this.TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        }
      };

      const request = https.request(options, (response) => {
        let responseData = '';

        response.on('data', (chunk) => {
          responseData += chunk;
        });

        response.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error}`));
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

      if (postData) {
        request.write(postData);
      }

      request.end();
    });
  }
}