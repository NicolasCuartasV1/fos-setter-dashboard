import React from "react";

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-white">
        {p}
      </strong>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const blocks = text.split(/\n\n+/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter(Boolean);
        const isList =
          lines.length > 0 && lines.every((l) => /^[-*]\s/.test(l.trim()));
        if (isList) {
          return (
            <ul key={bi} className="space-y-1.5">
              {lines.map((line, li) => (
                <li key={li} className="flex gap-2 items-start text-[#ccc]">
                  <span className="text-lime mt-[3px] flex-shrink-0 text-[10px]">
                    &#9656;
                  </span>
                  <span>
                    {renderInline(line.replace(/^[-*]\s+/, ""))}
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="leading-relaxed text-[#ccc]">
            {block.split("\n").map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(l)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export default function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] bg-lime text-black rounded-2xl rounded-br-sm px-4 py-2.5 text-sm font-medium leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex justify-start">
        <div className="bg-[#1C1C1C] border border-border rounded-2xl rounded-bl-sm px-4 py-3 inline-flex gap-1.5 items-center">
          {[0, 120, 240].map((d) => (
            <span
              key={d}
              className="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] bg-[#1C1C1C] border border-border rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
        {renderMarkdown(content)}
      </div>
    </div>
  );
}
