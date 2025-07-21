import { IpDetector } from './ipDetector.js';
import { CloudflareService } from './cloudflare.js';
import { StorageService } from './storage.js';
import { Logger } from './logger.js';
import { UpdateEntry } from '../types/index.js';
import { randomUUID } from 'crypto';

export class IpMonitor {
  private interval: NodeJS.Timeout | null = null;
  private isChecking = false;
  private status: 'active' | 'checking' | 'error' = 'active';

  start(): void {
    Logger.info('Starting IP monitoring service');
    console.log('Starting IP monitoring...');
    
    // Do an initial check immediately
    this.performIpCheck()
      .then(() => {
        Logger.info('Initial IP check completed');
        this.scheduleNextCheck();
      })
      .catch((error) => {
        Logger.error('Initial IP check failed', error as Error);
        this.scheduleNextCheck(); // Still schedule future checks
      });
  }

  stop(): void {
    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = null;
    }
    console.log('IP monitoring stopped');
  }

  async forceCheck(): Promise<{ success: boolean; ipChanged: boolean; currentIp: string | null; message: string }> {
    if (this.isChecking) {
      return {
        success: false,
        ipChanged: false,
        currentIp: null,
        message: 'Check already in progress'
      };
    }

    try {
      const result = await this.performIpCheck();
      return {
        success: true,
        ipChanged: result.ipChanged,
        currentIp: result.currentIp,
        message: result.ipChanged ? 'IP address updated' : 'No change detected'
      };
    } catch (error) {
      return {
        success: false,
        ipChanged: false,
        currentIp: null,
        message: `Check failed: ${error}`
      };
    }
  }

  getStatus(): 'active' | 'checking' | 'error' {
    return this.status;
  }

  getNextCheckTime(): Date {
    const config = StorageService.readConfig();
    const intervalMs = config.checkIntervalMinutes * 60 * 1000;
    return new Date(Date.now() + intervalMs);
  }

  private scheduleNextCheck(): void {
    const config = StorageService.readConfig();
    const intervalMs = config.checkIntervalMinutes * 60 * 1000;
    
    this.interval = setTimeout(() => {
      this.performIpCheck()
        .then(() => this.scheduleNextCheck())
        .catch((error) => {
          console.error('IP check failed, rescheduling:', error);
          this.scheduleNextCheck();
        });
    }, intervalMs);

    console.log(`Next IP check scheduled in ${config.checkIntervalMinutes} minutes`);
  }

  private async performIpCheck(): Promise<{ ipChanged: boolean; currentIp: string }> {
    this.isChecking = true;
    this.status = 'checking';
    
    try {
      Logger.info('Starting IP check');
      console.log('Checking IP address...');
      
      // Get current IP
      const currentIp = await IpDetector.getCurrentIp();
      const config = StorageService.readConfig();
      
      // Get current DNS record IP
      let dnsRecordIp: string | null = null;
      let dnsRecordAccessible = true;
      try {
        const dnsRecord = await CloudflareService.getDnsRecord();
        dnsRecordIp = dnsRecord?.content || null;
        Logger.debug('DNS record check result', {
          dnsRecordIp,
          recordName: process.env.DNS_RECORD_NAME,
          recordFound: !!dnsRecord
        });
      } catch (error) {
        dnsRecordAccessible = false;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        if (errorMsg.includes('credentials') || errorMsg.includes('access denied')) {
          Logger.warn('DNS record check skipped - authentication issue', {
            error: errorMsg,
            usingTestCredentials: process.env.CLOUDFLARE_API_TOKEN?.includes('test_') || 
                                 process.env.CLOUDFLARE_ZONE_ID?.includes('test_')
          });
        } else {
          Logger.warn('Failed to get DNS record for comparison', { error: errorMsg });
        }
      }
      
      Logger.debug('IP comparison', {
        currentIp,
        lastKnownIp: config.lastKnownIp,
        dnsRecordIp,
        detectionService: 'ipify/icanhazip'
      });
      
      // Check if IP has changed - compare against stored IP and DNS record (if accessible)
      const ipChangedFromStored = config.lastKnownIp !== currentIp;
      const ipChangedFromDns = dnsRecordAccessible && (dnsRecordIp !== currentIp);
      const ipChanged = ipChangedFromStored || ipChangedFromDns;
      
      Logger.info('IP change analysis', {
        currentIp,
        storedIp: config.lastKnownIp,
        dnsIp: dnsRecordIp,
        dnsRecordAccessible,
        changedFromStored: ipChangedFromStored,
        changedFromDns: ipChangedFromDns,
        updateRequired: ipChanged
      });
      
      if (ipChanged) {
        const changeReason = ipChangedFromDns ? 
          `DNS record (${dnsRecordIp}) differs from current IP` :
          `Stored IP (${config.lastKnownIp}) differs from current IP`;
          
        Logger.info('IP address update required', {
          currentIp,
          storedIp: config.lastKnownIp,
          dnsIp: dnsRecordIp,
          reason: changeReason,
          dnsRecord: process.env.DNS_RECORD_NAME
        });
        console.log(`IP update required: ${changeReason} -> ${currentIp}`);
        
        // Always update the stored IP first
        StorageService.updateLastKnownIp(currentIp);
        
        // Try to update DNS record (may fail with test credentials)
        let dnsUpdateSuccess = false;
        let dnsError = '';
        
        try {
          Logger.debug('Attempting DNS record update', {
            newIp: currentIp,
            recordName: process.env.DNS_RECORD_NAME,
            zoneId: process.env.CLOUDFLARE_ZONE_ID?.substring(0, 8) + '...',
            hasToken: !!process.env.CLOUDFLARE_API_TOKEN
          });
          
          dnsUpdateSuccess = await CloudflareService.updateDnsRecord(currentIp);
          
          Logger.logDnsUpdate({
            success: dnsUpdateSuccess,
            ip: currentIp,
            recordName: process.env.DNS_RECORD_NAME,
            context: { zoneId: process.env.CLOUDFLARE_ZONE_ID }
          });
          
        } catch (error) {
          dnsError = error instanceof Error ? error.message : 'Unknown DNS error';
          
          Logger.logDnsUpdate({
            success: false,
            ip: currentIp,
            recordName: process.env.DNS_RECORD_NAME,
            error: dnsError,
            context: { 
              zoneId: process.env.CLOUDFLARE_ZONE_ID,
              errorType: error instanceof Error ? error.constructor.name : 'Unknown',
              stack: error instanceof Error ? error.stack : undefined
            }
          });
          
          console.warn('DNS update failed (expected with test credentials):', dnsError);
        }
        
        // Create update entry - use DNS record IP as "old IP" if available
        const updateEntry: UpdateEntry = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          oldIp: dnsRecordIp || config.lastKnownIp,
          newIp: currentIp,
          status: dnsUpdateSuccess ? 'success' : 'failed',
          dnsRecordUpdated: dnsUpdateSuccess
        };
        
        // Store update
        StorageService.addUpdateEntry(updateEntry);
        
        // Set status based on whether we have valid credentials and DNS access
        const isTestMode = process.env.CLOUDFLARE_API_TOKEN?.includes('test_') || 
                          process.env.CLOUDFLARE_ZONE_ID?.includes('test_') ||
                          !dnsRecordAccessible;
        
        if (isTestMode) {
          // Test credentials or DNS inaccessible - don't show error, IP monitoring is working
          this.status = 'active';
          console.log('Using test credentials or DNS inaccessible - IP monitoring active, DNS updates disabled');
          Logger.info('IP monitoring active in test mode', {
            currentIp,
            ipChanged,
            testCredentials: true,
            dnsUpdateAttempted: false
          });
        } else {
          // Real credentials - show error if DNS update failed
          this.status = dnsUpdateSuccess ? 'active' : 'error';
          if (!dnsUpdateSuccess) {
            throw new Error(`DNS update failed: ${dnsError}`);
          }
        }
      } else {
        Logger.info('No IP update required', {
          currentIp,
          storedIp: config.lastKnownIp,
          dnsIp: dnsRecordIp,
          allMatch: true
        });
        console.log('No IP change detected - all IPs match');
        this.status = 'active';
      }
      
      return { ipChanged, currentIp };
      
    } catch (error) {
      this.status = 'error';
      console.error('IP check failed:', error);
      
      // Record failed check
      const updateEntry: UpdateEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        oldIp: null,
        newIp: 'check_failed',
        status: 'failed',
        dnsRecordUpdated: false
      };
      
      try {
        StorageService.addUpdateEntry(updateEntry);
      } catch (storageError) {
        console.error('Failed to record error entry:', storageError);
      }
      
      throw error;
    } finally {
      this.isChecking = false;
    }
  }
}