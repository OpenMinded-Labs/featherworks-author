"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { User, Shield, Users, Trash2, Key, BarChart3 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useTranslation, type Language } from "@/lib/i18n"
import { useTheme } from "next-themes"

interface OperatorPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function OperatorPanel({ isOpen, onClose }: OperatorPanelProps) {
  const { language, setLanguage } = useLanguage()
  const t = useTranslation(language)
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState("user")

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-14 bottom-0 w-96 bg-card border-l border-border shadow-lg z-50 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">{t.operatorPanel}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="user">
              <User className="h-4 w-4 mr-2" />
              {t.userCenter}
            </TabsTrigger>
            <TabsTrigger value="admin">
              <Shield className="h-4 w-4 mr-2" />
              {t.adminPanel}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="user" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t.profile}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t.firstName}</Label>
                  <Input id="firstName" placeholder="Max" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t.lastName}</Label>
                  <Input id="lastName" placeholder="Mustermann" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t.email}</Label>
                  <Input id="email" type="email" placeholder="max@example.com" />
                </div>
                <Button className="w-full">{t.save}</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.changePassword}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t.currentPassword}</Label>
                  <Input id="currentPassword" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t.newPassword}</Label>
                  <Input id="newPassword" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t.confirmPassword}</Label>
                  <Input id="confirmPassword" type="password" />
                </div>
                <Button className="w-full">{t.changePassword}</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.changeLanguage}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={language} onValueChange={(val) => setLanguage(val as Language)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                    <SelectItem value="en">🇬🇧 English</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.theme}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t.light}</SelectItem>
                    <SelectItem value="dark">{t.dark}</SelectItem>
                    <SelectItem value="eco">{t.eco}</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admin" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t.metrics}</CardTitle>
                <CardDescription>Systemübersicht</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t.totalUsers}</span>
                  </div>
                  <span className="font-semibold">1,234</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t.activeUsers}</span>
                  </div>
                  <span className="font-semibold">892</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t.totalProjects}</span>
                  </div>
                  <span className="font-semibold">5,678</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t.storageUsed}</span>
                  </div>
                  <span className="font-semibold">234 GB</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.userManagement}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="userEmail">{t.userEmail}</Label>
                  <Input id="userEmail" type="email" placeholder="user@example.com" />
                </div>
                <div className="flex gap-2">
                  <Button variant="destructive" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t.deleteUser}
                  </Button>
                  <Button variant="outline" className="flex-1 bg-transparent">
                    <Key className="h-4 w-4 mr-2" />
                    {t.forcePasswordReset}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
