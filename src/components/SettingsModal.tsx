"use client";

import { useState } from "react";
import { useSettings } from "@/lib/store";
import { DEFAULT_SETTINGS } from "@/lib/prompts";

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { settings, setSettings, resetSettings } = useSettings();
  const [showKey, setShowKey] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-panel border border-panel-border rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-panel-border">
          <h2 className="text-base font-medium text-white">Settings</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset all settings (including prompts) to defaults?")) {
                  resetSettings();
                }
              }}
              className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-md border border-panel-border hover:border-neutral-500 transition-colors"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-neutral-200 bg-panel-soft hover:bg-neutral-700 px-3 py-1.5 rounded-md border border-panel-border"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* API KEY */}
          <Section
            title="Groq API Key"
            description="Paste your Groq API key (stored in your browser only — never shipped anywhere but Groq). Get one at https://console.groq.com/keys."
          >
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={settings.groqApiKey}
                onChange={(e) => setSettings({ groqApiKey: e.target.value })}
                placeholder="gsk_…"
                className="flex-1 bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-400"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="text-xs text-neutral-300 bg-panel-soft hover:bg-neutral-700 px-3 rounded-md border border-panel-border"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </Section>

          {/* MEETING CONTEXT */}
          <Section
            title="Meeting Context"
            description="What is the context of the conversation / meeting? This field changes suggestion quality as it tells the model whose perspective to take."
          >
            <div className="flex gap-2">
              <input
                value={settings.meetingContext}
                onChange={(e) => setSettings({ meetingContext: e.target.value })}
                placeholder="e.g., Technical interview - I'm the candidate"
                className="flex-1 bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-400"
              />
            </div>
          </Section>

          {/* MODELS */}
          <Section
            title="Models"
            description="Locked to Groq per the assignment spec. Edit only if you know what you're doing."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Transcription">
                <input
                  type="text"
                  value={settings.transcriptionModel}
                  onChange={(e) =>
                    setSettings({ transcriptionModel: e.target.value })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm font-mono text-neutral-100"
                />
              </Field>
              <Field label="Suggestions">
                <input
                  type="text"
                  value={settings.suggestionModel}
                  onChange={(e) =>
                    setSettings({ suggestionModel: e.target.value })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm font-mono text-neutral-100"
                />
              </Field>
              <Field label="Chat">
                <input
                  type="text"
                  value={settings.chatModel}
                  onChange={(e) => setSettings({ chatModel: e.target.value })}
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm font-mono text-neutral-100"
                />
              </Field>
            </div>
          </Section>

          {/* TIMING */}
          <Section
            title="Timing & Sampling"
            description="Tune cadence, context size, and model creativity."
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Refresh interval (ms)">
                <input
                  type="number"
                  min={5000}
                  step={1000}
                  value={settings.refreshIntervalMs}
                  onChange={(e) =>
                    setSettings({ refreshIntervalMs: Number(e.target.value) })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Audio chunk (ms)">
                <input
                  type="number"
                  min={5000}
                  step={1000}
                  value={settings.chunkDurationMs}
                  onChange={(e) =>
                    setSettings({ chunkDurationMs: Number(e.target.value) })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Dedup: recent batches">
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={settings.recentBatchesForDedup}
                  onChange={(e) =>
                    setSettings({
                      recentBatchesForDedup: Number(e.target.value),
                    })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Suggestion ctx (chars)">
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={settings.suggestionContextChars}
                  onChange={(e) =>
                    setSettings({
                      suggestionContextChars: Number(e.target.value),
                    })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Detailed-answer ctx (chars)">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={settings.detailedAnswerContextChars}
                  onChange={(e) =>
                    setSettings({
                      detailedAnswerContextChars: Number(e.target.value),
                    })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Chat ctx (chars)">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={settings.chatContextChars}
                  onChange={(e) =>
                    setSettings({ chatContextChars: Number(e.target.value) })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Suggestion temp">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  value={settings.suggestionTemperature}
                  onChange={(e) =>
                    setSettings({
                      suggestionTemperature: Number(e.target.value),
                    })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Chat temp">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={2}
                  value={settings.chatTemperature}
                  onChange={(e) =>
                    setSettings({ chatTemperature: Number(e.target.value) })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                />
              </Field>
              <Field label="Suggestion reasoning">
                <select
                  value={settings.suggestionReasoningEffort}
                  onChange={(e) =>
                    setSettings({
                      suggestionReasoningEffort: e.target.value as
                        | "low"
                        | "medium"
                        | "high",
                    })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </Field>
              <Field label="Chat reasoning">
                <select
                  value={settings.chatReasoningEffort}
                  onChange={(e) =>
                    setSettings({
                      chatReasoningEffort: e.target.value as
                        | "low"
                        | "medium"
                        | "high",
                    })
                  }
                  className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* PROMPTS */}
          <Section
            title="System Prompts"
            description="The most important settings. These defaults are the result of iteration — edit with care, or hit Reset."
          >
            <PromptField
              label="Live suggestion prompt"
              value={settings.suggestionSystemPrompt}
              onChange={(v) => setSettings({ suggestionSystemPrompt: v })}
              onReset={() =>
                setSettings({
                  suggestionSystemPrompt:
                    DEFAULT_SETTINGS.suggestionSystemPrompt,
                })
              }
            />
            <PromptField
              label="Detailed-answer (suggestion click) prompt"
              value={settings.detailedAnswerSystemPrompt}
              onChange={(v) => setSettings({ detailedAnswerSystemPrompt: v })}
              onReset={() =>
                setSettings({
                  detailedAnswerSystemPrompt:
                    DEFAULT_SETTINGS.detailedAnswerSystemPrompt,
                })
              }
            />
            <PromptField
              label="Chat prompt"
              value={settings.chatSystemPrompt}
              onChange={(v) => setSettings({ chatSystemPrompt: v })}
              onReset={() =>
                setSettings({
                  chatSystemPrompt: DEFAULT_SETTINGS.chatSystemPrompt,
                })
              }
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function PromptField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] uppercase tracking-wider text-neutral-500">
          {label}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-neutral-400 hover:text-white"
        >
          Reset this prompt
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        className="w-full bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-xs font-mono text-neutral-100 leading-relaxed focus:outline-none focus:border-neutral-400"
      />
    </div>
  );
}
