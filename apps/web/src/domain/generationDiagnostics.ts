/** 迁移自现有项目 generationErrorReport.ts 的安全文本处理部分。 */
export function sanitizeGenerationDiagnosticText(value: string): string {
  return value
    .replace(/data:[^;\s,]+(?:;[^,\s]+)*;base64,[A-Za-z0-9+/_=-]+/gi, '[data-url omitted]')
    .replace(/\b(Bearer|Basic|Token)\s+[^\s,;"'}]+/gi, '$1 [redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url redacted]');
}
export function createReferenceImagePlaceholders(count: number) { return Array.from({ length: Math.max(0, Math.min(64, Math.floor(count))) }, (_, index) => `[IMAGE_${index + 1}]`); }
