type Handler = () => void;
const stack: Handler[] = [];

function syncMarker() {
  const hasMarker = !!(window.history.state && window.history.state.__modal);
  if (stack.length > 0 && !hasMarker) {
    window.history.pushState({ __modal: true }, "");
  }
}

window.addEventListener("popstate", () => {
  if (stack.length > 0) {
    const top = stack.pop()!;
    top();
  }
});

export function registerBackHandler(handler: Handler) {
  stack.push(handler);
  syncMarker();
}

export function unregisterBackHandler(handler: Handler) {
  const idx = stack.indexOf(handler);
  if (idx >= 0) {
    stack.splice(idx, 1);
  }
  if (stack.length === 0 && window.history.state?.__modal) {
    window.history.back();
  }
}

export function clearModalMarker() {
  if (window.history.state?.__modal) {
    window.history.back();
  }
}
