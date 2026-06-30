"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { AssistantMessage, FeasibilityProject } from "@/lib/types";
import {
  createAssistantMessage,
  generateAssistantReply,
} from "@/lib/assistant/local-assistant";
import { Button, Card } from "@/components/ui/Form";
import { cn } from "@/lib/cn";

const SUGGESTIONS = [
  "What are setback requirements?",
  "Summarize blocking issues",
  "What's the permit process?",
  "Is parking required?",
];

export function AssistantSidebar({
  project,
  messages,
  onMessagesChange,
  embedded = false,
}: {
  project: FeasibilityProject;
  messages: AssistantMessage[];
  onMessagesChange: (messages: AssistantMessage[]) => void;
  embedded?: boolean;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    const userMsg = createAssistantMessage("user", text.trim());
    const nextMessages = [...messages, userMsg];
    onMessagesChange(nextMessages);

    await new Promise((r) => setTimeout(r, 200));
    const reply = generateAssistantReply(text, project);
    const assistantMsg = createAssistantMessage("assistant", reply);
    onMessagesChange([...nextMessages, assistantMsg]);
    setInput("");
    setLoading(false);
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {!embedded && (
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Code Assistant</h2>
          <p className="text-xs text-slate-500">
            Local Burbank rules · no data leaves your browser
          </p>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <Card className="bg-white p-3 text-sm text-slate-600">
            Ask about setbacks, size, parking, permits, or current findings.
            Responses are generated from encoded BMC rules — not a live planner.
          </Card>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              m.role === "user"
                ? "ml-6 bg-slate-900 text-white"
                : "mr-4 bg-white border border-slate-200 text-slate-800"
            )}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
          </div>
        ))}
        {loading && (
          <p className="text-xs text-slate-400">Checking rules…</p>
        )}
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Burbank ADU rules…"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <Button type="submit" disabled={loading || !input.trim()} className="px-3">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
