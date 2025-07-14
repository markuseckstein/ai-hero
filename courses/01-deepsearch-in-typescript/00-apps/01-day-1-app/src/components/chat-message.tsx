import ReactMarkdown, { type Components } from "react-markdown";
import type { Message } from "ai";
import { ExternalLink } from "lucide-react";

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

const ToolInvocation = ({
  part,
}: {
  part: Extract<MessagePart, { type: "tool-invocation" }>;
}) => {
  if (part.type !== "tool-invocation") return null;
  const { toolInvocation } = part;
  const { state, toolName, toolCallId, args } = toolInvocation;
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
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-gray-300">
            {JSON.stringify(toolInvocation.result, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
};

const Source = ({ part }: { part: Extract<MessagePart, { type: "source" }> }) => {
  if (part.type !== "source") return null;
  const { source } = part;
  return (
    <div className="my-2 flex flex-wrap items-center gap-2 rounded bg-blue-900/60 p-2 text-xs text-blue-200" title={JSON.stringify(part, null, 2)}>
      <span className="font-bold">Source:</span>
      {source.title && <span className="mr-1 truncate max-w-[120px]" title={source.title}>{source.title}</span>}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 underline text-blue-300 hover:text-blue-400"
      >
        <span className="truncate max-w-[200px] align-middle">{source.url}</span>
        <ExternalLink className="inline-block h-3 w-3 align-middle" />
      </a>
      {source.providerMetadata && (
        <span className="text-blue-300 ml-2">Provider: {JSON.stringify(source.providerMetadata)}</span>
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
          {parts.map((part, idx) => {
            if (part.type === "text") {
              return <Markdown key={idx}>{part.text}</Markdown>;
            }
            if (part.type === "tool-invocation") {
              return <ToolInvocation key={idx} part={part} />;
            }
            if (part.type === "source") {
              return <Source key={idx} part={part} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
