"use client";

import clsx from "clsx";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Panel } from "./ui";
import { useSession } from "@/lib/store";
import { useChatStream } from "@/lib/useChatStream";
import type { Suggestion } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      // Per mockup: clicking a card pushes the PREVIEW into chat as the user
      // turn, then streams the detailed answer.
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
                className={`text-[10px] font-semibold tracking-widest uppercase mb-1.5 ${
                  m.role === "user" ? "text-neutral-400" : "text-neutral-500"
                }`}
              >
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              {/* <div className="prose-chat text-[14px] text-neutral-100 whitespace-pre-wrap"> */}
              {/* <div className={clsx(
                "prose-chat text-[14px] text-neutral-100 whitespace-pre-wrap",
                m.role === "assistant"
                  ? "bg-panel-soft/60 border border-panel-border rounded-md px-4 py-3"
                  : "px-1",
              )}>
                {m.content ? (
                    m.content
                  ) : m.role === "assistant" ? (
                    <ThinkingIndicator />
                  ) : null}
                {m.content || (
                  <span className="text-neutral-500 italic">…</span>
                )}
              </div> */}
              <div
                className={clsx(
                  "prose prose-invert max-w-none text-[14px]",
                  m.role === "assistant"
                    ? "bg-panel-soft/60 border border-panel-border rounded-md px-4 py-3"
                    : "px-1"
                )}
              >
                {m.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
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