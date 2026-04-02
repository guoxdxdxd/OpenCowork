import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Server,
  Trash2,
  Pencil,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react'
import { useSshStore, type SshConnection, type SshGroup } from '@renderer/stores/ssh-store'
import { ipcClient } from '@renderer/lib/ipc/ipc-client'
import { IPC } from '@renderer/lib/ipc/channels'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { toast } from 'sonner'
import { confirm } from '@renderer/components/ui/confirm-dialog'
import { SshConnectionForm } from './SshConnectionForm'
import { SshGroupDialog } from './SshGroupDialog'
import { SshImportDialog } from './SshImportDialog'

interface SshConnectionListProps {
  onConnect: (connectionId: string) => void
}

const TEST_STATUS_TTL_MS = 15000

export function SshConnectionList({ onConnect }: SshConnectionListProps): React.JSX.Element {
  const { t } = useTranslation('ssh')

  const groups = useSshStore((s) => s.groups)
  const connections = useSshStore((s) => s.connections)
  const sessions = useSshStore((s) => s.sessions)
  const loadAll = useSshStore((s) => s.loadAll)

  const [showForm, setShowForm] = useState(false)
  const [editingConnection, setEditingConnection] = useState<SshConnection | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<SshGroup | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, { ok: boolean; at: number }>>({})
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)

  const toggleGroup = (groupId: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleConnect = useCallback(
    async (connectionId: string) => {
      onConnect(connectionId)
    },
    [onConnect]
  )

  const handleOpenTerminal = useCallback(
    (connectionId: string) => {
      onConnect(connectionId)
    },
    [onConnect]
  )

  const handleDisconnect = useCallback(async (sessionId: string) => {
    await useSshStore.getState().disconnect(sessionId)
  }, [])

  const handleTest = useCallback(
    async (connectionId: string) => {
      setTestingId(connectionId)
      try {
        const result = await useSshStore.getState().testConnection(connectionId)
        setTestStatus((prev) => ({
          ...prev,
          [connectionId]: { ok: result.success, at: Date.now() }
        }))
        if (result.success) {
          toast.success(t('connectionSuccess'))
        } else {
          toast.error(`${t('connectionFailed')}: ${result.error}`)
        }
      } finally {
        setTestingId(null)
      }
    },
    [t]
  )

  const handleDeleteConnection = useCallback(
    async (connection: SshConnection) => {
      const ok = await confirm({
        title: t('deleteConnection'),
        description: t('confirmDelete')
      })
      if (!ok) return
      await useSshStore.getState().deleteConnection(connection.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(connection.id)
        return next
      })
      toast.success(t('deleted'))
    },
    [t]
  )

  const handleDeleteGroup = useCallback(
    async (group: SshGroup) => {
      const ok = await confirm({
        title: t('groupDialog.title'),
        description: t('confirmDeleteGroup')
      })
      if (!ok) return
      await useSshStore.getState().deleteGroup(group.id)
      toast.success(t('groupDeleted'))
    },
    [t]
  )

  const handleExport = useCallback(
    async (scope: 'all' | 'selected') => {
      const connectionIds =
        scope === 'selected' ? Array.from(selectedIds) : connections.map((item) => item.id)
      if (connectionIds.length === 0) {
        toast.error(t('migration.noSelection'))
        return
      }

      const ok = await confirm({
        title: t('migration.exportSensitiveTitle'),
        description: t('migration.exportSensitiveDesc')
      })
      if (!ok) return

      const date = new Date().toISOString().slice(0, 10)
      const filePick = await ipcClient.invoke(IPC.FS_SELECT_SAVE_FILE, {
        defaultPath: `open-cowork-ssh-${scope}-${date}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!filePick || typeof filePick !== 'object' || !('path' in filePick) || !filePick.path)
        return

      const result = (await ipcClient.invoke(IPC.SSH_EXPORT, {
        filePath: filePick.path,
        connectionIds: scope === 'all' ? undefined : connectionIds
      })) as { success?: boolean; error?: string }

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(t('migration.exportSuccess'))
    },
    [connections, selectedIds, t]
  )

  const getSessionForConnection = useCallback(
    (connectionId: string) => {
      return Object.values(sessions).find(
        (s) =>
          s.connectionId === connectionId && (s.status === 'connected' || s.status === 'connecting')
      )
    },
    [sessions]
  )

  const grouped = new Map<string | null, SshConnection[]>()
  for (const conn of connections) {
    const key = conn.groupId
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(conn)
  }

  const visibleConnections =
    selectedGroupId === null
      ? connections
      : connections.filter((c) => c.groupId === selectedGroupId)

  const visibleIds = useMemo(
    () => visibleConnections.map((connection) => connection.id),
    [visibleConnections]
  )
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))
  const now = Date.now()

  return (
    <div className="flex h-full w-full min-w-0 flex-1 overflow-hidden">
      {/* Left sidebar: Group tree */}
      <div className="flex w-56 shrink-0 flex-col border-r bg-muted/20">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {t('groups')}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {/* All connections */}
          <button
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
              selectedGroupId === null
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            onClick={() => setSelectedGroupId(null)}
          >
            <Server className="size-3 shrink-0" />
            <span className="truncate">{t('list.allConnections')}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/50">
              {connections.length}
            </span>
          </button>

          {/* Groups */}
          {groups.map((group) => {
            const groupConns = grouped.get(group.id) || []
            const isCollapsed = collapsedGroups.has(group.id)
            const isSelected = selectedGroupId === group.id
            return (
              <div key={group.id} className="mt-0.5">
                <div className="flex items-center group">
                  <button
                    className={cn(
                      'flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      isSelected
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <button
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleGroup(group.id)
                      }}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3 text-muted-foreground/50" />
                      ) : (
                        <ChevronDown className="size-3 text-muted-foreground/50" />
                      )}
                    </button>
                    <span className="truncate">{group.name}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground/50">
                      {groupConns.length}
                    </span>
                  </button>
                  <button
                    className="mr-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                    onClick={() => {
                      setEditingGroup(group)
                      setGroupDialogOpen(true)
                    }}
                  >
                    <Pencil className="size-2.5 text-muted-foreground/50" />
                  </button>
                  <button
                    className="mr-1 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
                    onClick={() => void handleDeleteGroup(group)}
                  >
                    <Trash2 className="size-2.5 text-destructive/60" />
                  </button>
                </div>
                {!isCollapsed &&
                  groupConns.map((conn) => {
                    const sess = getSessionForConnection(conn.id)
                    const isConnected = sess?.status === 'connected'
                    return (
                      <button
                        key={conn.id}
                        className="ml-4 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
                        onClick={() => void handleOpenTerminal(conn.id)}
                      >
                        <div className="relative">
                          <Server className="size-2.5" />
                          {isConnected && (
                            <div className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500" />
                          )}
                        </div>
                        <span className="truncate">{conn.name}</span>
                      </button>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main area: Connection table */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 border-b px-3 py-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => void loadAll()}
          >
            <RefreshCw className="size-3.5" />
            {t('list.refresh')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="size-3.5" />
            {t('migration.importButton')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => void handleExport('all')}
          >
            <Download className="size-3.5" />
            {t('migration.exportAll')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => void handleExport('selected')}
            disabled={selectedIds.size === 0}
          >
            <Download className="size-3.5" />
            {t('migration.exportSelected')}
            {selectedIds.size > 0 && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                {selectedIds.size}
              </span>
            )}
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => {
              setEditingGroup(null)
              setGroupDialogOpen(true)
            }}
          >
            <FolderPlus className="size-3.5" />
            {t('list.addGroup')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => {
              setEditingConnection(null)
              setShowForm(true)
            }}
          >
            <Plus className="size-3.5" />
            {t('list.addServer')}
          </Button>
          <div className="ml-auto text-[11px] text-muted-foreground">
            {selectedIds.size > 0
              ? t('migration.selectedSummary', { count: selectedIds.size })
              : t('migration.selectionHint')}
          </div>
        </div>

        {/* Connection list */}
        <div className="min-h-0 flex-1 overflow-auto">
          {visibleConnections.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <Server className="mb-3 size-10 text-muted-foreground/25" />
              <p className="text-sm text-muted-foreground/60">{t('noConnections')}</p>
              <p className="mt-1 text-xs text-muted-foreground/40">{t('noConnectionsDesc')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1 text-xs"
                onClick={() => {
                  setEditingConnection(null)
                  setShowForm(true)
                }}
              >
                <Plus className="size-3" />
                {t('newConnection')}
              </Button>
            </div>
          ) : (
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[36px_minmax(0,1.3fr)_160px_190px_150px_190px] items-center border-b bg-muted/20 px-4 py-2 text-[11px] font-medium text-muted-foreground">
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={
                      allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false
                    }
                    onCheckedChange={(checked) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        if (checked) {
                          visibleIds.forEach((id) => next.add(id))
                        } else {
                          visibleIds.forEach((id) => next.delete(id))
                        }
                        return next
                      })
                    }}
                    aria-label={t('migration.selectAll')}
                  />
                </div>
                <span>{t('migration.columns.name')}</span>
                <span>{t('migration.columns.status')}</span>
                <span>{t('migration.columns.address')}</span>
                <span>{t('migration.columns.system')}</span>
                <span>{t('migration.columns.operation')}</span>
              </div>

              {visibleConnections.map((conn) => {
                const sess = getSessionForConnection(conn.id)
                const isConnected = sess?.status === 'connected'
                const isConnecting = sess?.status === 'connecting'
                const isTesting = testingId === conn.id
                const group = groups.find((g) => g.id === conn.groupId)
                const testInfo = testStatus[conn.id]
                const testFresh = testInfo ? now - testInfo.at < TEST_STATUS_TTL_MS : false
                const isReachable = !isConnected && !isConnecting && testFresh && !!testInfo?.ok
                const isUnreachable =
                  !isConnected && !isConnecting && testFresh && testInfo != null && !testInfo.ok
                const isSelected = selectedIds.has(conn.id)

                return (
                  <div
                    key={conn.id}
                    className={cn(
                      'grid grid-cols-[36px_minmax(0,1.3fr)_160px_190px_150px_190px] items-center gap-3 border-b px-4 py-3 text-xs transition-colors hover:bg-muted/20',
                      isSelected && 'bg-primary/5'
                    )}
                  >
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(conn.id)
                            else next.delete(conn.id)
                            return next
                          })
                        }}
                        aria-label={t('migration.selectOne', { name: conn.name })}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-muted/40">
                            <Server className="size-4 text-muted-foreground" />
                          </div>
                          {isConnected && (
                            <div className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
                          )}
                          {isConnecting && (
                            <div className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full border-2 border-background bg-amber-500" />
                          )}
                          {isReachable && (
                            <div className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-400" />
                          )}
                          {isUnreachable && (
                            <div className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-destructive" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{conn.name}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {group && <Badge variant="outline">{group.name}</Badge>}
                            <Badge variant="outline">{t(`migration.auth.${conn.authType}`)}</Badge>
                            {conn.proxyJump && <Badge variant="outline">ProxyJump</Badge>}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      {isConnected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
                          <div className="size-1.5 rounded-full bg-emerald-500" />
                          {t('list.online')}
                        </span>
                      ) : isConnecting ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-500">
                          <Loader2 className="size-3 animate-spin" />
                          {t('connecting')}
                        </span>
                      ) : isReachable ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
                          <div className="size-1.5 rounded-full bg-emerald-500" />
                          {t('list.reachable')}
                        </span>
                      ) : isUnreachable ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                          <div className="size-1.5 rounded-full bg-destructive" />
                          {t('list.unreachable')}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">
                          {t('list.offline')}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 text-muted-foreground">
                      <div className="truncate">
                        {conn.host}:{conn.port}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground/70">
                        {conn.username}
                      </div>
                    </div>

                    <div className="min-w-0 text-muted-foreground">
                      <div className="truncate">{conn.authType}</div>
                      <div className="truncate text-[11px] text-muted-foreground/70">
                        {conn.keepAliveInterval}s keepalive
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {isConnected && sess ? (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-3 text-xs"
                            onClick={() => handleOpenTerminal(conn.id)}
                          >
                            {t('openTerminal')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void handleDisconnect(sess.id)}
                            title={t('disconnect')}
                          >
                            <Square className="size-3" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 px-3 text-xs"
                          onClick={() => void handleConnect(conn.id)}
                          disabled={isConnecting}
                        >
                          {isConnecting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <>
                              <Play className="mr-1 size-3" />
                              {t('connect')}
                            </>
                          )}
                        </Button>
                      )}
                      {isTesting ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground/50" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => void handleTest(conn.id)}
                          title={t('testConnection')}
                        >
                          <CheckCircle2 className="size-3 text-muted-foreground/50" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setEditingConnection(conn)
                          setShowForm(true)
                        }}
                        title={t('editConnection')}
                      >
                        <Pencil className="size-3 text-muted-foreground/50" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void handleDeleteConnection(conn)}
                        title={t('deleteConnection')}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Connection Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false)
            setEditingConnection(null)
          }
        }}
      >
        <DialogContent
          className="h-[85vh] max-h-[85vh] gap-0 p-0 sm:max-w-sm flex flex-col"
          showCloseButton={false}
        >
          <SshConnectionForm
            connection={editingConnection}
            groups={groups}
            onClose={() => {
              setShowForm(false)
              setEditingConnection(null)
            }}
            onSaved={() => {
              setShowForm(false)
              setEditingConnection(null)
              toast.success(t('saved'))
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <SshGroupDialog
        open={groupDialogOpen}
        group={editingGroup}
        onClose={() => {
          setGroupDialogOpen(false)
          setEditingGroup(null)
        }}
      />

      <SshImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          setSelectedIds(new Set())
          void loadAll()
        }}
      />
    </div>
  )
}
