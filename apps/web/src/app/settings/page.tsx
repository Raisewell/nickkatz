"use client";

import { Protected } from "@/components/protected";
import { TeamSettings, DataSettings, WebhookSettings } from "@/components/settings-sections";

export default function SettingsPage() {
  return (
    <Protected>
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your team and your workspace&apos;s data.</p>
      <div className="mt-6 space-y-6">
        <TeamSettings />
        <DataSettings />
        <WebhookSettings />
      </div>
    </Protected>
  );
}
