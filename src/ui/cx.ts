/** Join class names, skipping falsy values: cx("ui-btn", primary && "ui-btn--primary"). */
export function cx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(" ");
}
