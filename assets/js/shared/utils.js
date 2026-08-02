// assets/js/shared/utils.js
// Small generic helpers shared across frontend modules.

export function debounce(fn, delayMs = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'checked') {
      node.checked = Boolean(value);
    } else {
      node.setAttribute(key, value);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((child) => {
    if (child === null || child === undefined) return;
    // Only an actual DOM Node can be appended directly -- anything
    // else (string, number, boolean, ...) is converted to a text node.
    // A render() function returning a raw number/boolean instead of a
    // string is an easy mistake (see transaction-list.js's Products
    // "available" column, which did exactly this) -- handling it here
    // means that mistake becomes a harmless display issue everywhere
    // it might occur, not a hard crash.
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

export function uniqueId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
