import ReactMarkdown, { type Components } from "react-markdown";
import type { Message } from "ai";

export type MessagePart = NonNullable<Message["parts"]>[number];

interface ChatMessageProps {
  parts: MessagePart[];
  role: string;
  userName: string;
}

const components: Components = {
  // Override default elements with custom styling
  p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ className, children, ...props }) => (
    <code className={`${className ?? ""}`} {...props}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
      {children}
    </pre>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-blue-400 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

import React, { useState } from "react";

const ToolInvocation = ({
  part,
}: {
  part: Extract<MessagePart, { type: "tool-invocation" }>;
}) => {
  if (part.type !== "tool-invocation") return null;
  const { toolInvocation } = part;
  const { state, toolName, toolCallId, args } = toolInvocation;
  const [showResult, setShowResult] = useState(false);
  const resultString =
    toolInvocation.state === "result" && toolInvocation.result
      ? JSON.stringify(toolInvocation.result, null, 2)
      : "";
  const isLarge = resultString.length > 800;
  return (
    <div
      className="my-2 rounded bg-gray-700 p-2 text-xs text-gray-200"
      title={JSON.stringify(part, null, 2)}
    >
      <strong>Tool Call:</strong> {toolName} ({toolCallId}) <br />
      <span className="text-gray-400">State: {state}</span> <br />
      <span className="text-gray-400">Args:</span> <br />
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-gray-300">
        {JSON.stringify(args, null, 2)}
      </pre>
      {toolInvocation.state === "result" && toolInvocation.result && (
        <>
          <span className="text-gray-400">Result:</span> <br />
          {isLarge ? (
            <div>
              <button
                className="mb-2 rounded bg-gray-600 px-2 py-1 text-xs text-blue-300 hover:bg-gray-500 focus:outline-none"
                onClick={() => setShowResult((v) => !v)}
              >
                {showResult ? "Hide" : `Show (${resultString.length} chars)`}{" "}
                Result
              </button>
              {showResult && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-gray-300">
                  {resultString}
                </pre>
              )}
            </div>
          ) : (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-gray-300">
              {resultString}
            </pre>
          )}
        </>
      )}
    </div>
  );
};

const Markdown = ({ children }: { children: string }) => {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
};

export const ChatMessage = ({ parts, role, userName }: ChatMessageProps) => {
  const isAI = role === "assistant";

  return (
    <div className="mb-6">
      <div
        className={`rounded-lg p-4 ${
          isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
        }`}
      >
        <p className="mb-2 text-sm font-semibold text-gray-400">
          {isAI ? "AI" : userName}
        </p>
        <div className="prose prose-invert max-w-none">
          {parts &&
            parts.length &&
            parts.map((part, idx) => {
              if (part.type === "text") {
                return <Markdown key={idx}>{part.text}</Markdown>;
              }
              if (part.type === "tool-invocation") {
                return <ToolInvocation key={idx} part={part} />;
              }
              // You can add more part types here as needed
              return null;
            })}
        </div>
      </div>
    </div>
  );
};
