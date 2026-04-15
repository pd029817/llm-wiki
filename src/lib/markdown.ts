function formatLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  if (/^제\s*\d+\s*편(?:\s|[(])/.test(trimmed) && trimmed.length < 120) return `## ${trimmed}`;
  if (/^제\s*\d+\s*장(?:\s|[(]|$)/.test(trimmed) && trimmed.length < 120) return `## ${trimmed}`;
  if (/^제\s*\d+\s*절(?:\s|[(]|$)/.test(trimmed) && trimmed.length < 120) return `### ${trimmed}`;
  if (/^제\s*\d+\s*조(?:\s|[(]|$)/.test(trimmed) && trimmed.length < 200) return `### ${trimmed}`;

  if (/^(chapter|section|part)\s+\d+/i.test(trimmed) && trimmed.length < 120) return `## ${trimmed}`;

  const numMatch = trimmed.match(/^(\d+(?:\.\d+){0,3})\.?\s+(.+)$/);
  if (numMatch && trimmed.length < 120 && !/[.!?]$/.test(trimmed)) {
    const depth = Math.min(numMatch[1].split(".").length + 1, 6);
    return `${"#".repeat(depth)} ${trimmed}`;
  }

  const bullet = trimmed.match(/^[·•●■◆▪▫◦\-–—*]\s*(.+)$/);
  if (bullet) return `- ${bullet[1]}`;

  const ordered = trimmed.match(/^(?:\(\s*(\d+)\s*\)|(\d+)\))\s*(.+)$/);
  if (ordered) return `- ${trimmed}`;

  return trimmed;
}

export function toMarkdown(title: string, content: string): string {
  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocks: string[] = [];
  for (const p of paragraphs) {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
    const formatted = lines.map(formatLine);
    const allStructural = formatted.every(
      (l) => l.startsWith("- ") || /^#{1,6}\s/.test(l),
    );

    if (allStructural) {
      blocks.push(formatted.join("\n"));
      continue;
    }

    const first = formatLine(lines[0]);
    if (/^#{1,6}\s/.test(first)) {
      const rest = lines.slice(1).join(" ").trim();
      blocks.push(rest ? `${first}\n\n${rest}` : first);
      continue;
    }

    blocks.push(lines.join(" "));
  }

  const body = blocks.join("\n\n");
  return `# ${title}\n\n${body}\n`;
}

export function stripExtension(title: string): string {
  return (title || "문서").replace(/\.[a-z0-9]+$/i, "");
}
