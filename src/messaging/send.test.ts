import { describe, it, expect } from "vitest";
import { markdownToPlainText } from "./send.js";

describe("markdownToPlainText", () => {
  // --- Code blocks ---
  it("strips code block fences and keeps content", () => {
    const input = "```\nconsole.log('hi');\n```";
    expect(markdownToPlainText(input)).toBe("console.log('hi');");
  });

  it("strips code block fences with language identifier", () => {
    const input = "```typescript\nconst x: number = 1;\n```";
    expect(markdownToPlainText(input)).toBe("const x: number = 1;");
  });

  it("strips code block fences with language identifier (python)", () => {
    const input = "```python\ndef foo():\n    return 42\n```";
    expect(markdownToPlainText(input)).toBe("def foo():\n    return 42");
  });

  // --- Images ---
  it("removes images entirely", () => {
    const input = "Check this: ![alt text](https://example.com/img.png) end";
    expect(markdownToPlainText(input)).toBe("Check this:  end");
  });

  it("removes images with empty alt text", () => {
    const input = "![](https://example.com/img.png)";
    expect(markdownToPlainText(input)).toBe("");
  });

  // --- Links ---
  it("keeps link display text, removes URL", () => {
    const input = "Visit [Google](https://google.com) for search.";
    expect(markdownToPlainText(input)).toBe("Visit Google for search.");
  });

  it("handles multiple links", () => {
    const input = "[A](http://a.com) and [B](http://b.com)";
    expect(markdownToPlainText(input)).toBe("A and B");
  });

  // --- Tables ---
  it("converts table rows: strips pipes, joins cells with double space", () => {
    const input = "| Name | Age |\n|------|-----|\n| Alice | 30 |";
    expect(markdownToPlainText(input)).toBe("Name  Age\n\nAlice  30");
  });

  it("removes separator rows from tables", () => {
    const input = "|:---|:---:|---:|";
    expect(markdownToPlainText(input)).toBe("");
  });

  // --- Bold ---
  it("strips bold (double asterisks)", () => {
    expect(markdownToPlainText("This is **bold** text")).toBe("This is bold text");
  });

  it("strips bold (double underscores)", () => {
    expect(markdownToPlainText("This is __bold__ text")).toBe("This is bold text");
  });

  // --- Italic ---
  it("strips italic (single asterisk)", () => {
    expect(markdownToPlainText("This is *italic* text")).toBe("This is italic text");
  });

  it("strips italic (single underscore)", () => {
    expect(markdownToPlainText("This is _italic_ text")).toBe("This is italic text");
  });

  // --- Strikethrough ---
  it("strips strikethrough", () => {
    expect(markdownToPlainText("This is ~~deleted~~ text")).toBe("This is deleted text");
  });

  // --- Headings ---
  it("strips h1 heading marker", () => {
    expect(markdownToPlainText("# Title")).toBe("Title");
  });

  it("strips h3 heading marker", () => {
    expect(markdownToPlainText("### Subtitle")).toBe("Subtitle");
  });

  it("strips h6 heading marker", () => {
    expect(markdownToPlainText("###### Deep heading")).toBe("Deep heading");
  });

  // --- Blockquotes ---
  it("strips blockquote marker", () => {
    expect(markdownToPlainText("> This is quoted")).toBe("This is quoted");
  });

  it("strips blockquote marker with no space after >", () => {
    expect(markdownToPlainText(">No space")).toBe("No space");
  });

  // --- Inline code ---
  it("strips inline code backticks", () => {
    expect(markdownToPlainText("Use `console.log()` for debugging")).toBe(
      "Use console.log() for debugging",
    );
  });

  // --- Horizontal rules ---
  it("removes horizontal rule (---)", () => {
    expect(markdownToPlainText("Above\n---\nBelow")).toBe("Above\n\nBelow");
  });

  it("removes horizontal rule (***)", () => {
    expect(markdownToPlainText("Above\n***\nBelow")).toBe("Above\n\nBelow");
  });

  it("removes horizontal rule (___)", () => {
    expect(markdownToPlainText("Above\n___\nBelow")).toBe("Above\n\nBelow");
  });

  // --- Multiple blank lines ---
  it("collapses 3+ newlines to double newline", () => {
    expect(markdownToPlainText("A\n\n\n\nB")).toBe("A\n\nB");
  });

  // --- Code blocks: fences are stripped, but content is NOT protected from stripMarkdown ---
  it("strips code fences and also applies inline markdown stripping to content", () => {
    // Implementation detail: markdownToPlainText strips fences first,
    // then stripMarkdown runs on the entire result including former code block content
    const input = "```\n**bold** and *italic*\n```";
    expect(markdownToPlainText(input)).toBe("bold and italic");
  });

  it("preserves code content that does not match markdown patterns", () => {
    // /#{1,6}/g does not match the heading regex (^#{1,6}\s+), so it survives stripMarkdown
    const input = "```js\nconst re = /#{1,6}/g;\n```";
    expect(markdownToPlainText(input)).toBe("const re = /#{1,6}/g;");
  });

  // --- Mixed scenario ---
  it("handles mixed markdown content", () => {
    const input = [
      "# Welcome",
      "",
      "This is **important** and *useful*.",
      "",
      "```python",
      "print('hello')",
      "```",
      "",
      "Visit [docs](https://docs.example.com) for more.",
      "",
      "> A wise quote",
      "",
      "---",
      "",
      "End of document.",
    ].join("\n");

    const result = markdownToPlainText(input);
    expect(result).toContain("Welcome");
    expect(result).toContain("important");
    expect(result).toContain("useful");
    expect(result).toContain("print('hello')");
    expect(result).toContain("Visit docs for more.");
    expect(result).toContain("A wise quote");
    expect(result).toContain("End of document.");
    expect(result).not.toContain("**");
    expect(result).not.toContain("```");
    expect(result).not.toContain("](");
    expect(result).not.toContain("---");
  });

  // --- Plain text passthrough ---
  it("passes through plain text unchanged", () => {
    const input = "This is plain text with no markdown.";
    expect(markdownToPlainText(input)).toBe(input);
  });

  it("passes through empty string", () => {
    expect(markdownToPlainText("")).toBe("");
  });

  it("passes through whitespace-only after trim", () => {
    expect(markdownToPlainText("   ")).toBe("");
  });
});
