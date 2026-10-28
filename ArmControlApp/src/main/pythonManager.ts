import { spawn, ChildProcess } from 'child_process'
import { createInterface, Interface } from 'readline'
import { EventEmitter } from 'events'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface CommandRequest {
  id?: string
  cmd: string
  [key: string]: any
}

export interface CommandResponse {
  id?: string
  success?: boolean
  error?: string
  data?: any
  type?: string
  [key: string]: any
}

export class PythonManager extends EventEmitter {
  private process: ChildProcess | null = null
  private readlineInterface: Interface | null = null
  private pendingRequests: Map<
    string,
    {
      resolve: (val: any) => void
      reject: (err: Error) => void
      timer: NodeJS.Timeout
    }
  > = new Map()
  private requestCounter: number = 0
  private isReady: boolean = false
  private startPromise: Promise<void> | null = null

  constructor() {
    super()
  }

  public async start(): Promise<void> {
    if (this.process && !this.process.killed) {
      return
    }

    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = new Promise((resolve, reject) => {
      try {
        const { execPath, args, cwd } = this.resolvePythonTarget()
        console.log(`[PythonManager] Starting backend: ${execPath} ${args.join(' ')} (CWD: ${cwd})`)

        const proc = spawn(execPath, args, {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
          },
          windowsHide: true
        })

        this.process = proc

        const rl = createInterface({
          input: proc.stdout!,
          terminal: false
        })
        this.readlineInterface = rl

        rl.on('line', (line: string) => {
          this.handleLine(line)
        })

        proc.stderr!.on('data', (data: Buffer) => {
          const text = data.toString('utf-8')
          console.warn(`[PythonManager Stderr] ${text.trim()}`)
        })

        proc.on('error', (err) => {
          console.error('[PythonManager] Process error:', err)
          this.cleanup()
          this.startPromise = null
          reject(err)
        })

        proc.on('exit', (code, signal) => {
          console.warn(`[PythonManager] Process exited with code ${code}, signal ${signal}`)
          this.cleanup()
          this.startPromise = null
          this.emit('exit', { code, signal })
        })

        // Wait for ready event or ping response
        const readyTimeout = setTimeout(() => {
          this.sendCommand({ cmd: 'ping' }, 2000)
            .then(() => {
              this.isReady = true
              this.startPromise = null
              resolve()
            })
            .catch((e) => {
              this.startPromise = null
              reject(new Error(`Python backend failed to start: ${e.message}`))
            })
        }, 2000)

        this.once('ready', () => {
          clearTimeout(readyTimeout)
          this.isReady = true
          this.startPromise = null
          resolve()
        })
      } catch (err) {
        this.startPromise = null
        reject(err)
      }
    })

    return this.startPromise
  }

  private resolvePythonTarget(): { execPath: string; args: string[]; cwd: string } {
    const isPackaged = app ? app.isPackaged : false

    if (isPackaged) {
      // Look for standalone executable bundled in extraResources
      const possibleExePaths = [
        path.join(process.resourcesPath, 'bin', 'main.exe'),
        path.join(process.resourcesPath, 'dist', 'main.exe'),
        path.join(process.resourcesPath, 'main.exe'),
        path.join(process.resourcesPath, 'backend', 'main.exe'),
        path.join(app.getAppPath(), 'dist', 'main.exe'),
        path.join(app.getAppPath(), '..', 'dist', 'main.exe')
      ]

      for (const p of possibleExePaths) {
        if (fs.existsSync(p)) {
          return { execPath: p, args: [], cwd: path.dirname(p) }
        }
      }
    }

    // Development fallback: run python -u backend/main.py
    const rootDir = app ? app.getAppPath() : process.cwd()
    const scriptCandidates = [
      path.join(rootDir, 'backend', 'main.py'),
      path.join(rootDir, '..', 'backend', 'main.py'),
      path.resolve(__dirname, '../../backend/main.py'),
      path.resolve(__dirname, '../../../backend/main.py')
    ]

    let scriptPath = scriptCandidates[0]
    for (const c of scriptCandidates) {
      if (fs.existsSync(c)) {
        scriptPath = c
        break
      }
    }

    const pythonBin = process.env.PYTHON_PATH || 'python'
    return {
      execPath: pythonBin,
      args: ['-u', scriptPath],
      cwd: path.dirname(scriptPath)
    }
  }

  public async sendCommand<T = any>(req: CommandRequest, timeoutMs: number = 10000): Promise<T> {
    if (!this.process || this.process.killed) {
      await this.start()
    }

    const id = `req-${++this.requestCounter}`
    const fullReq = { id, ...req }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Command '${req.cmd}' timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer })

      try {
        const payload = JSON.stringify(fullReq) + '\n'
        this.process!.stdin!.write(payload, 'utf-8', (err) => {
          if (err) {
            clearTimeout(timer)
            this.pendingRequests.delete(id)
            reject(err)
          }
        })
      } catch (writeErr) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        reject(writeErr)
      }
    })
  }

  private handleLine(line: string) {
    const trimmed = line.trim()
    if (!trimmed) return

    try {
      const msg: CommandResponse = JSON.parse(trimmed)

      // 1. If it's a response to a pending request with an ID
      if (msg.id && this.pendingRequests.has(msg.id)) {
        const pending = this.pendingRequests.get(msg.id)!
        this.pendingRequests.delete(msg.id)
        clearTimeout(pending.timer)

        if (msg.success === false) {
          pending.reject(new Error(msg.error || 'Command failed'))
        } else {
          pending.resolve(msg)
        }
        return
      }

      // 2. Asynchronous events
      if (msg.type) {
        if (msg.type === 'ready') {
          this.emit('ready', msg)
        } else {
          this.emit(msg.type, msg.data !== undefined ? msg.data : msg)
        }
      }
    } catch (e) {
      console.warn(`[PythonManager] Failed to parse JSON line: "${trimmed}"`, e)
    }
  }

  private cleanup() {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Python process terminated'))
    }
    this.pendingRequests.clear()
    this.isReady = false
    if (this.readlineInterface) {
      this.readlineInterface.close()
      this.readlineInterface = null
    }
    this.process = null
  }

  public async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      return new Promise((resolve) => {
        try {
          this.process!.kill('SIGTERM')
        } catch (e) {}
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            try {
              this.process!.kill('SIGKILL')
            } catch (e) {}
          }
          this.cleanup()
          resolve()
        }, 500)
      })
    }
  }
}

export const pythonManager = new PythonManager()
