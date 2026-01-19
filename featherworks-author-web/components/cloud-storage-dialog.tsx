"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Cloud, Check, Loader2, X } from "lucide-react"
import {
  getCloudConnections,
  connectToProvider,
  disconnectFromProvider,
  syncToCloud,
  getProviderName,
  type CloudProvider,
  type CloudConnection,
} from "@/lib/cloud-storage"
import { exportToFWAuthor } from "@/lib/export"
import type { Project, Entity } from "@/lib/types"

interface CloudStorageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string
  entities: Entity[]
  project: Project | null
}

export function CloudStorageDialog({ open, onOpenChange, content, entities, project }: CloudStorageDialogProps) {
  const [connections, setConnections] = useState<CloudConnection[]>([])
  const [connecting, setConnecting] = useState<CloudProvider | null>(null)
  const [syncing, setSyncing] = useState<CloudProvider | null>(null)

  useEffect(() => {
    if (open) {
      setConnections(getCloudConnections())
    }
  }, [open])

  const handleConnect = async (provider: CloudProvider) => {
    setConnecting(provider)
    try {
      await connectToProvider(provider)
      setConnections(getCloudConnections())
    } catch (error) {
      console.error("Failed to connect:", error)
      alert("Verbindung fehlgeschlagen. Bitte versuchen Sie es erneut.")
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = (provider: CloudProvider) => {
    disconnectFromProvider(provider)
    setConnections(getCloudConnections())
  }

  const handleSync = async (provider: CloudProvider) => {
    setSyncing(provider)
    try {
      const data = exportToFWAuthor(content, entities, project)
      await syncToCloud(provider, data)
      setConnections(getCloudConnections())
      alert("Erfolgreich synchronisiert!")
    } catch (error) {
      console.error("Sync failed:", error)
      alert("Synchronisierung fehlgeschlagen. Bitte versuchen Sie es erneut.")
    } finally {
      setSyncing(null)
    }
  }

  const providers: CloudProvider[] = ["icloud", "onedrive", "googledrive"]

  const getConnection = (provider: CloudProvider) => {
    return connections.find((c) => c.provider === provider)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cloud-Speicher</DialogTitle>
          <DialogDescription>Verbinden Sie Ihre Cloud-Speicher, um Ihre Projekte zu synchronisieren</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {providers.map((provider) => {
            const connection = getConnection(provider)
            const isConnecting = connecting === provider
            const isSyncing = syncing === provider

            return (
              <Card key={provider} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Cloud className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium text-sm">{getProviderName(provider)}</h4>
                      {connection?.connected && connection.email && (
                        <p className="text-xs text-muted-foreground">{connection.email}</p>
                      )}
                      {connection?.connected && connection.lastSync && (
                        <p className="text-xs text-muted-foreground">
                          Zuletzt synchronisiert: {new Date(connection.lastSync).toLocaleString("de-DE")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {connection?.connected ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSync(provider)}
                          disabled={isSyncing || isConnecting}
                        >
                          {isSyncing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Synchronisiere...
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Synchronisieren
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDisconnect(provider)}
                          disabled={isSyncing || isConnecting}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => handleConnect(provider)} disabled={isConnecting || isSyncing}>
                        {isConnecting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Verbinde...
                          </>
                        ) : (
                          "Verbinden"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground">
            <strong>Hinweis:</strong> In der Web-Version ist die Cloud-Synchronisierung simuliert. Die vollständige
            Integration ist in der Desktop-Version verfügbar, die Sie um diese Web-Version herum bauen können.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
