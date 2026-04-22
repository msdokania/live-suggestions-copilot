"use client";

import { useEffect, useRef, useState } from "react";
import { TranscriptColumn } from "@/components/TranscriptColumn";
import { SuggestionsColumn } from "@/components/SuggestionsColumn";
import { ChatColumn, type ChatColumnHandle } from "@/components/ChatColumn";
import { SettingsModal } from "@/components/SettingsModal";
import { useSession, useSettings } from "@/lib/store";
import { buildSessionExport, downloadSessionJson } from "@/lib/exportSession";

export default function Page() {
  const { sessionStart, transcript, batches, chat } = useSession();
  const { settings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatRef = useRef<ChatColumnHandle>(null);

  // Nudge the user into Settings on first load if no API key is set.
  useEffect(() => {
    if (!settings.groqApiKey) setSettingsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = () => {
    const data = buildSessionExport({
      sessionStart,
      transcript,
      batches,
      chat,
    });
    downloadSessionJson(data);
  };

  return (
    <main className="h-screen w-screen flex flex-col bg-[#0a0c10]">
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={handleExport}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
        <TranscriptColumn />
        <SuggestionsColumn
          onSuggestionClick={(s) => chatRef.current?.sendSuggestion(s)}
        />
        <ChatColumn ref={chatRef} />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}

function TopBar({
  onOpenSettings,
  onExport,
}: {
  onOpenSettings: () => void;
  onExport: () => void;
}) {
  return (
    <header className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-panel-border bg-[#0a0c10]">
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-white tracking-tight">
          TwinMind
        </span>
        <span className="text-[11px] text-neutral-500 tracking-wide">
          Live Suggestions · 3-column copilot
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          className="text-[12px] text-neutral-200 bg-panel-soft hover:bg-neutral-700 border border-panel-border px-3 py-1.5 rounded-md transition-colors"
          title="Export transcript + suggestions + chat as JSON"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-[12px] text-neutral-200 bg-panel-soft hover:bg-neutral-700 border border-panel-border px-3 py-1.5 rounded-md transition-colors"
          title="Edit prompts, API key, and parameters"
        >
          ⚙ Settings
        </button>
      </div>
    </header>
  );
}
