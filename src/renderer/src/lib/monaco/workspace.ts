import * as monaco from 'monaco-editor'

export type EditorWorkspace =
  | {
      kind: 'local'
      rootPath: string
    }
  | {
      kind: 'ssh'
      connectionId: string
      rootPath: string
    }

export interface CreateModelUriOptions {
  filePath: string
  workspace?: EditorWorkspace | null
  workspaceEnabled: boolean
  remoteLanguageServiceEnabled: boolean
}

export function createLocalWorkspace(rootPath?: string | null): EditorWorkspace | null {
  const normalized = normalizeWorkspaceRoot(rootPath)
  if (!normalized) return null
  return {
    kind: 'local',
    rootPath: normalized
  }
}

export function createSshWorkspace(
  connectionId?: string | null,
  rootPath?: string | null
): EditorWorkspace | null {
  const normalizedConnectionId = connectionId?.trim()
  const normalizedRootPath = normalizeWorkspaceRoot(rootPath)
  if (!normalizedConnectionId || !normalizedRootPath) return null
  return {
    kind: 'ssh',
    connectionId: normalizedConnectionId,
    rootPath: normalizedRootPath
  }
}

export function normalizeWorkspaceRoot(rootPath?: string | null): string | null {
  const trimmed = rootPath?.trim()
  return trimmed ? trimmed : null
}

export function getParentPath(filePath: string): string | null {
  const normalized = filePath.trim()
  if (!normalized) return null

  const lastSeparatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (lastSeparatorIndex < 0) return null
  if (lastSeparatorIndex === 0) return normalized[0] === '/' ? '/' : null
  if (lastSeparatorIndex === 2 && /^[A-Za-z]:/.test(normalized)) {
    return normalized.slice(0, 3)
  }

  return normalized.slice(0, lastSeparatorIndex)
}

export function createModelUri(options: CreateModelUriOptions): string {
  const { filePath, workspace, workspaceEnabled, remoteLanguageServiceEnabled } = options

  if (!workspaceEnabled || !workspace) {
    return createInMemoryUri(
      filePath,
      workspace?.kind === 'ssh' ? workspace.connectionId : undefined
    )
  }

  if (workspace.kind === 'local') {
    return monaco.Uri.file(filePath).toString()
  }

  if (!remoteLanguageServiceEnabled) {
    return createInMemoryUri(filePath, workspace.connectionId)
  }

  return monaco.Uri.from({
    scheme: 'ssh',
    authority: workspace.connectionId,
    path: normalizeRemotePath(filePath)
  }).toString()
}

function createInMemoryUri(filePath: string, authority?: string): string {
  return monaco.Uri.from({
    scheme: 'inmemory',
    authority: authority || 'opencowork',
    path: `/model/${encodeURIComponent(filePath)}`
  }).toString()
}

function normalizeRemotePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}
