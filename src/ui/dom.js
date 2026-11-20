export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((k) => k != null));
  return el;
}

// One floating tooltip for every [data-tip] element.
export function installTooltips() {
  const tip = h('div', { class: 'tooltip' });
  document.body.append(tip);
  let target = null;
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el === target) return;
    target = el;
    if (!el) return tip.classList.remove('show');
    tip.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    tip.classList.add('show');
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(innerWidth - tw - 8, Math.max(8, r.left))}px`;
    tip.style.top = `${r.bottom + 6}px`;
  });
}

export function toast(text, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, text);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

export function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
