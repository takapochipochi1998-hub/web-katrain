/**
 * Translate the rendered UI in place, without touching the components.
 *
 * The app's strings are hard-coded English across ~80k lines. Rather than
 * thread a t() through every component (and re-apply it on every upstream
 * merge), this watches the DOM and swaps text nodes and a few attributes that
 * exactly match a dictionary entry. Text nodes are edited through nodeValue,
 * which React tolerates: when it next renders that node it writes the English
 * again and the observer swaps it back.
 */

export type Dictionary = {
  /** Whole-string matches, compared after trimming. */
  exact: Readonly<Record<string, string>>;
  /** Tried in order when no exact entry matches. */
  patterns: ReadonlyArray<readonly [RegExp, string | ((match: string, ...groups: string[]) => string)]>;
};

const ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

export function translateString(dict: Dictionary, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let out = dict.exact[trimmed];
  if (out === undefined) {
    for (const [pattern, replacement] of dict.patterns) {
      if (pattern.test(trimmed)) {
        out = typeof replacement === 'string'
          ? trimmed.replace(pattern, replacement)
          : trimmed.replace(pattern, replacement);
        break;
      }
    }
  }
  if (out === undefined || out === trimmed) return null;
  const start = value.indexOf(trimmed);
  return value.slice(0, start) + out + value.slice(start + trimmed.length);
}

/** Start translating everything under `root`; the returned function restores the English. */
export function startDomTranslation(root: Element, dict: Dictionary): () => void {
  const originalText = new WeakMap<Text, { english: string; shown: string }>();
  const originalAttr = new WeakMap<Element, Map<string, string>>();
  const touchedText = new Set<WeakRef<Text>>();
  const touchedElements = new Set<WeakRef<Element>>();

  const skip = (el: Element | null): boolean => {
    for (let node = el; node; node = node.parentElement) {
      if (SKIP_TAGS.has(node.tagName) || (node as HTMLElement).isContentEditable) return true;
    }
    return false;
  };

  const translateText = (node: Text) => {
    if (skip(node.parentElement)) return;
    const next = translateString(dict, node.nodeValue ?? '');
    if (next === null) return;
    if (!originalText.has(node)) touchedText.add(new WeakRef(node));
    originalText.set(node, { english: node.nodeValue ?? '', shown: next });
    node.nodeValue = next;
  };

  const translateAttributes = (el: Element) => {
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      const next = translateString(dict, value);
      if (next === null) continue;
      let saved = originalAttr.get(el);
      if (!saved) {
        saved = new Map();
        originalAttr.set(el, saved);
        touchedElements.add(new WeakRef(el));
      }
      saved.set(name, value);
      el.setAttribute(name, next);
    }
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      translateText(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName)) return;
    translateAttributes(el);
    for (let child = el.firstChild; child; child = child.nextSibling) walk(child);
  };

  walk(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translateText(record.target as Text);
      else if (record.type === 'attributes') translateAttributes(record.target as Element);
      else record.addedNodes.forEach(walk);
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES],
  });

  return () => {
    observer.disconnect();
    for (const ref of touchedText) {
      const node = ref.deref();
      const saved = node && originalText.get(node);
      // Only undo what is still ours; React may have written something newer.
      if (node && saved && node.nodeValue === saved.shown) node.nodeValue = saved.english;
    }
    for (const ref of touchedElements) {
      const el = ref.deref();
      originalAttr.get(el!)?.forEach((value, name) => el!.setAttribute(name, value));
    }
  };
}
