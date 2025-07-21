import fs from 'fs';
import path from 'path';
import { Config, UpdateHistory, UpdateEntry } from '../types/index.js';

const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

export class StorageService {
  static readConfig(): Config {
    try {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading config:', error);
      throw new Error('Failed to read configuration');
    }
  }

  static writeConfig(config: Config): void {
    try {
      config.updatedAt = new Date().toISOString();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Error writing config:', error);
      throw new Error('Failed to write configuration');
    }
  }

  static readHistory(): UpdateHistory {
    try {
      const data = fs.readFileSync(HISTORY_PATH, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading history:', error);
      throw new Error('Failed to read update history');
    }
  }

  static writeHistory(history: UpdateHistory): void {
    try {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Error writing history:', error);
      throw new Error('Failed to write update history');
    }
  }

  static addUpdateEntry(entry: UpdateEntry): void {
    try {
      const history = this.readHistory();
      history.updates.unshift(entry); // Add to beginning
      
      // Keep only last 10 entries
      if (history.updates.length > 10) {
        history.updates = history.updates.slice(0, 10);
      }
      
      this.writeHistory(history);
    } catch (error) {
      console.error('Error adding update entry:', error);
      throw new Error('Failed to add update entry');
    }
  }

  static updateLastKnownIp(ip: string): void {
    try {
      const config = this.readConfig();
      config.lastKnownIp = ip;
      this.writeConfig(config);
    } catch (error) {
      console.error('Error updating last known IP:', error);
      throw new Error('Failed to update last known IP');
    }
  }
}