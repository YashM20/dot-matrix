/**
 * Copy text to the system clipboard; false when the page may not (the caller shows the text instead). A
 * write left pending (an unfocused page, a permission prompt nobody answers) counts as not copied after `ms`
 * (docs/EDITOR-PLAN.md §8.4). DOM-only and dependency-free, so the editor and the guides share it.
 */
export async function copyText(text: string, ms = 1500): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<boolean>(r => { timer = setTimeout(() => r(false), ms) })
  try { return await Promise.race([navigator.clipboard.writeText(text).then(() => true, () => false), late]) } catch { return false } finally { clearTimeout(timer) }
}
