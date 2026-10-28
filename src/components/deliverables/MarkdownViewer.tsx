"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className = "" }: MarkdownViewerProps) {
  if (!content || content.trim() === "") {
    return (
      <div className="text-xs text-muted-foreground italic py-3 text-center">
        No setup instructions or notes provided.
      </div>
    );
  }

  return (
    <div
      className={`prose prose-sm max-w-none text-foreground leading-relaxed space-y-2 [&>h1]:text-lg [&>h1]:font-bold [&>h1]:text-foreground [&>h2]:text-base [&>h2]:font-semibold [&>h2]:text-foreground [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-foreground [&>p]:text-sm [&>p]:text-muted-foreground [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-1 [&>pre]:bg-muted [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>code]:bg-muted [&>code]:text-primary [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:font-mono [&>code]:text-xs [&>blockquote]:border-l-4 [&>blockquote]:border-primary/40 [&>blockquote]:pl-3 [&>blockquote]:italic [&>a]:text-primary [&>a]:underline [&>a]:underline-offset-2 ${className}`}
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
    </div>
  );
}
