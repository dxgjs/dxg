/**
 * Simple template rendering: replace {{key}} with value from data.
 * If value is undefined, placeholder is left unchanged.
 */
export function render(template: string, data: Record<string, unknown>): string {
  return template.replace(/{{([^}]+)}}/g, (_, key: string) => {
    // Trim spaces inside key
    const cleanKey = key.trim();
    const value = data[cleanKey];
    return value === null || value === undefined ? `{{${key}}}` : String(value);
  });
}