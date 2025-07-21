export interface Config {
  checkIntervalMinutes: number;
  theme: 'light' | 'dark';
  lastKnownIp: string | null;
  createdAt: string;
  updatedAt: string;
  lastForceUpdateTime?: string;
}

export interface UpdateHistory {
  updates: UpdateEntry[];
}

export interface UpdateEntry {
  id: string;
  timestamp: string;
  oldIp: string | null;
  newIp: string;
  status: 'success' | 'failed';
  dnsRecordUpdated: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface StatusResponse {
  currentIp: string | null;
  lastUpdate: string | null;
  status: 'active' | 'checking' | 'error';
  nextCheck: string | null;
  dnsRecordName: string;
}