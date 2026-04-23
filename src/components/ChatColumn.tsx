"use client";

import clsx from "clsx";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Panel } from "./ui";
import { useSession } from "@/lib/store";
import { useChatStream } from "@/lib/useChatStream";
import type { Suggestion } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export interface ChatColumnHandle {
  sendSuggestion: (s: Suggestion) => void;
}

export const ChatColumn = forwardRef<ChatColumnHandle>(function ChatColumn(
  _props,
  ref,
) {
  const { chat } = useSession();
  const { send } = useChatStream();
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    sendSuggestion: (s) => {
      send(s.preview, s);
    },
  }));

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Panel
      title="3. Chat (Detailed Answers)"
      headerRight={<span>Session-only</span>}
    >
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-5"
      >
        {chat.length === 0 ? (
          <div className="text-neutral-500 text-sm leading-relaxed">
            Clicking a suggestion adds it here and streams a detailed answer
            with full transcript context. You can also type questions
            directly — one continuous chat per session.
          </div>
        ) : (
          chat.map((m) => (
            <div key={m.id}>
              <div
                className={`text-[10px] font-semibold tracking-widest uppercase mb-1.5 ${m.role === "user" ? "text-neutral-400" : "text-neutral-500"
                  }`}
              >
                {m.role === "assistant" ? ("ASSISTANT") : (
                  <>
                    YOU
                    {m.sourceSuggestionId === "model" && (
                      <>
                        <span className="text-neutral-600"> · </span>
                        <span className="text-neutral-500">ANSWER</span>
                      </>
                    )}
                  </>
                )}
              </div>

              <div
                className={clsx(
                  "prose prose-invert max-w-none text-[14px] break-anywhere",
                  "overflow-hidden",
                  m.role === "assistant"
                    ? "bg-panel-soft/60 border border-panel-border rounded-md px-4 py-3"
                    : "px-1"
                )}
              >
                {m.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {normalizeLatexInput(m.content)}
                  </ReactMarkdown>
                ) : m.role === "assistant" ? (
                  <ThinkingIndicator message="Thinking" />
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-panel-border px-4 py-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          rows={1}
          className="flex-1 resize-none bg-panel-soft border border-panel-border rounded-md px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-400 min-h-[40px] max-h-32"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim()}
          className="bg-blue-500 hover:bg-blue-400 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Send
        </button>
      </div>
      <div className="px-5">
        <div className="text-[11px] text-neutral-500 italic mt-1 mb-3 text-center">
          Based on model training knowledge - verify before citing in a meeting.
        </div>
      </div>
    </Panel>
  );
});

export function ThinkingIndicator({ message = "Thinking" }: { message?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-neutral-500 italic">
      {message}
      <span className="inline-flex gap-0.5">
        <span className="animate-pulse">.</span>
        <span className="animate-pulse" style={{ animationDelay: "150ms" }}>.</span>
        <span className="animate-pulse" style={{ animationDelay: "300ms" }}>.</span>
      </span>
    </span>
  );
}

function normalizeLatexInput(text: string) {
  return text
    .replace(/\u202F/g, " ")  // narrow no-break space 
    .replace(/\u00A0/g, " ")  // non-breaking space 
    .replace(/\u2011/g, "-")  // non-breaking hyphen 
    .replace(/\u2013/g, "-")  // en dash 
    .replace(/\u2014/g, "-"); // em dash
}