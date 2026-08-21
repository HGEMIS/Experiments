/* Small UI toolkit: toasts, modals, confirm, spinner, HTML escaping. */

const UI = {
  esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  toast(msg, type) {
    const wrap = document.getElementById('toast');
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => t.remove(), 3100);
  },

  spinner() { return '<div class="spin"></div>'; },

  // modal({title, html, actions:[{label, cls, onClick}]}) -> returns close()
  modal(opts) {
    const root = document.getElementById('modalRoot');
    const back = document.createElement('div');
    back.className = 'modal-back';
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `<h3>${UI.esc(opts.title || '')}</h3><div class="modal-body">${opts.html || ''}</div><div class="modal-actions"></div>`;
    const actions = box.querySelector('.modal-actions');
    const close = () => back.remove();
    (opts.actions || [{ label: 'Close', cls: 'sec', onClick: close }]).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn' + (a.cls === 'sec' ? ' sec' : a.cls === 'danger' ? ' danger' : '');
      b.textContent = a.label;
      b.onclick = () => a.onClick(close);
      actions.appendChild(b);
    });
    back.appendChild(box);
    back.onclick = (e) => { if (e.target === back && opts.dismissible !== false) close(); };
    root.appendChild(back);
    if (opts.onOpen) opts.onOpen(box);
    return close;
  },

  confirm(msg) {
    return new Promise((resolve) => {
      UI.modal({
        title: 'Please confirm',
        html: `<p>${UI.esc(msg)}</p>`,
        actions: [
          { label: 'Cancel', cls: 'sec', onClick: (c) => { c(); resolve(false); } },
          { label: 'Yes', cls: '', onClick: (c) => { c(); resolve(true); } }
        ]
      });
    });
  }
};
