import { MarkdownViewer } from "./markdown-viewer";

export function ChatMessage({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[70%] rounded-lg px-4 py-3 ${
        isUser ? "bg-gray-900 text-white" : "bg-gray-100"
      }`}>
        {isUser ? (
          <p className="text-sm">{content}</p>
        ) : (
          <MarkdownViewer content={content} />
        )}
      </div>
    </div>
  );
}
