import { app, ipcMain } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const USER_COMMANDS_DIR = path.join(os.homedir(), '.open-cowork', 'commands')

export interface CommandInfo {
  name: string
  summary: string
}

function getBundledCommandsDir(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', 'commands')
  }

  const unpackedDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'commands')
  if (fs.existsSync(unpackedDir)) {
    return unpackedDir
  }

  return path.join(process.resourcesPath, 'resources', 'commands')
}

function ensureUserCommandsDir(): void {
  if (!fs.existsSync(USER_COMMANDS_DIR)) {
    fs.mkdirSync(USER_COMMANDS_DIR, { recursive: true })
  }
}

function listCommandEntries(dir: string): fs.Dirent[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
}

function normalizeCommandName(name: string): string {
  return name.trim().toLowerCase()
}

function commandNameFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '')
}

function summarizeCommand(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const firstMeaningfulLine = lines.find((line) => !line.startsWith('```'))
  if (!firstMeaningfulLine) return ''

  const normalized = firstMeaningfulLine.replace(/^#+\s*/, '').trim()
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized
}

function resolveBundledCommandPath(name: string): string | null {
  const normalized = normalizeCommandName(name)
  if (!normalized) return null

  const bundledDir = getBundledCommandsDir()
  const matched = listCommandEntries(bundledDir).find(
    (entry) => normalizeCommandName(commandNameFromFilename(entry.name)) === normalized
  )

  if (!matched) return null
  return path.join(bundledDir, matched.name)
}

function resolveUserCommandPath(name: string): string | null {
  const normalized = normalizeCommandName(name)
  if (!normalized) return null

  const matched = listCommandEntries(USER_COMMANDS_DIR).find(
    (entry) => normalizeCommandName(commandNameFromFilename(entry.name)) === normalized
  )

  if (!matched) return null
  return path.join(USER_COMMANDS_DIR, matched.name)
}

function resolveCommandPath(name: string): string | null {
  return resolveBundledCommandPath(name) ?? resolveUserCommandPath(name)
}

function collectCommands(): CommandInfo[] {
  const commandsByName = new Map<string, CommandInfo>()
  const commandPaths = [
    ...listCommandEntries(getBundledCommandsDir()).map((entry) =>
      path.join(getBundledCommandsDir(), entry.name)
    ),
    ...listCommandEntries(USER_COMMANDS_DIR).map((entry) =>
      path.join(USER_COMMANDS_DIR, entry.name)
    )
  ]

  for (const commandPath of commandPaths) {
    const name = commandNameFromFilename(path.basename(commandPath))
    const normalizedName = normalizeCommandName(name)
    if (commandsByName.has(normalizedName)) continue

    const content = fs.readFileSync(commandPath, 'utf-8')
    commandsByName.set(normalizedName, {
      name,
      summary: summarizeCommand(content)
    })
  }

  return [...commandsByName.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  )
}

export function registerCommandsHandlers(): void {
  ensureUserCommandsDir()

  ipcMain.handle('commands:list', async (): Promise<CommandInfo[]> => {
    try {
      return collectCommands()
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'commands:load',
    async (
      _event,
      args: { name: string }
    ): Promise<
      { name: string; content: string; summary: string } | { error: string; notFound?: boolean }
    > => {
      try {
        const name = args?.name?.trim()
        if (!name) return { error: 'Command name is required' }

        const commandPath = resolveCommandPath(name)
        if (!commandPath) return { error: `Command "${name}" not found`, notFound: true }

        const content = fs.readFileSync(commandPath, 'utf-8').trim()
        if (!content) return { error: `Command "${name}" is empty` }

        return {
          name: commandNameFromFilename(path.basename(commandPath)),
          content,
          summary: summarizeCommand(content)
        }
      } catch (err) {
        return { error: String(err) }
      }
    }
  )
}
