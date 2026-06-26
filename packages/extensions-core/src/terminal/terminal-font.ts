export const FONT_STACK_WINDOWS =
  '"Cascadia Code", Consolas, "Courier New", monospace';
export const FONT_STACK_MAC = '"SF Mono", Menlo, Monaco, monospace';
export const FONT_STACK_LINUX =
  '"DejaVu Sans Mono", "Liberation Mono", monospace';

export function effectiveFontFamily(
  fontFamily: string,
  isWindows: boolean,
  isMac: boolean,
): string {
  const custom = fontFamily.trim();
  if (custom) return custom;
  if (isWindows) return FONT_STACK_WINDOWS;
  if (isMac) return FONT_STACK_MAC;
  return FONT_STACK_LINUX;
}
