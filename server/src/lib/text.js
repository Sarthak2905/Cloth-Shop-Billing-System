// Makes search text safe to use inside a regular expression, so a search for "("
// or ".*" is matched literally.
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
