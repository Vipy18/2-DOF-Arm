import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { AppConfig } from '../shared/types'

const DEFAULT_CONFIG: AppConfig = {
  lastPort: '',
  motor1: {
    jointLimitMin: -170,
    jointLimitMax: 170,
    maxCurrent: 5.0
  },
  motor2: {
    jointLimitMin: -150,
    jointLimitMax: 150,
    maxCurrent: 5.0
  }
}

export class ConfigStore {
  private configPath: string
  private cachedConfig: AppConfig | null = null

  constructor() {
    try {
      const userDataDir = app.getPath('userData')
      this.configPath = path.join(userDataDir, 'config.json')
    } catch {
      // Fallback for non-electron environment / testing
      this.configPath = path.join(process.cwd(), 'config.json')
    }
  }

  public getConfig(): AppConfig {
    if (this.cachedConfig) {
      return this.cachedConfig
    }

    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        this.cachedConfig = {
          ...DEFAULT_CONFIG,
          ...parsed,
          motor1: {
            ...DEFAULT_CONFIG.motor1,
            ...(parsed.motor1 || {})
          },
          motor2: {
            ...DEFAULT_CONFIG.motor2,
            ...(parsed.motor2 || {})
          }
        }
        return this.cachedConfig!
      }
    } catch (err) {
      console.error('[ConfigStore] Failed to read config file, using defaults:', err)
    }

    this.cachedConfig = { ...DEFAULT_CONFIG }
    this.saveConfig(this.cachedConfig)
    return this.cachedConfig
  }

  public saveConfig(config: AppConfig): void {
    try {
      this.cachedConfig = { ...config }
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.cachedConfig, null, 2), 'utf-8')
    } catch (err) {
      console.error('[ConfigStore] Failed to save config file:', err)
    }
  }
}

export const configStore = new ConfigStore()
