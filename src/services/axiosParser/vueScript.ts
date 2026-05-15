export interface ScriptBlock {
  readonly content: string;
  readonly lineOffset: number;
  readonly columnOffset: number;
  readonly lang: 'ts' | 'js';
}

const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

export function extractScriptBlocks(source: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  let match: RegExpExecArray | null;
  SCRIPT_TAG_RE.lastIndex = 0;
  while ((match = SCRIPT_TAG_RE.exec(source)) !== null) {
    const attrs = match[1] ?? '';
    const content = match[2] ?? '';
    const tagStart = match.index;
    const contentStart = tagStart + match[0].indexOf(content);
    const before = source.slice(0, contentStart);
    const lineOffset = countLines(before);
    const columnOffset = contentStart - (before.lastIndexOf('\n') + 1);
    const lang = /\blang\s*=\s*["']?ts["']?/i.test(attrs) ? 'ts' : 'js';
    blocks.push({ content, lineOffset, columnOffset, lang });
  }
  return blocks;
}

export function findContainingScript(
  source: string,
  line: number,
  character: number
): ScriptBlock | undefined {
  const blocks = extractScriptBlocks(source);
  for (const b of blocks) {
    const startLine = b.lineOffset;
    const endLine = startLine + countLines(b.content);
    if (line < startLine) {
      continue;
    }
    if (line > endLine) {
      continue;
    }
    if (line === startLine && character < b.columnOffset) {
      continue;
    }
    return b;
  }
  return undefined;
}

function countLines(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) {
      count++;
    }
  }
  return count;
}
