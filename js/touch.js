// touch.js — 行動裝置觸控操作:虛擬方向/油門/煞車/手煞/換檔按鈕
// 由 index.html 的 #touch-ui 承載;pointer 事件直接寫 input 旗標。
// 設計重點:
// - 每顆按鈕獨立追蹤自己的 pointerId 集合 → 多指同時「轉向 + 油門」互不干擾
// - pointerdown 明確 setPointerCapture:move/up 一定回到本按鈕,不會被其他元素吃掉
// - 手指滑出按鈕範圍 → 立即放開該旗標 (不卡住);pointerup/cancel/lostpointercapture 三重保險
export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function initTouch(input, { onCycleCam, onMirror } = {}) {
  const root = document.getElementById('touch-ui');
  if (!root) return { setVisible() {}, setManual() {} };

  const bind = (id, down, up) => {
    const el = document.getElementById(id);
    if (!el) return;
    const active = new Set(); // 正按住本按鈕的 pointerId

    // 圓形按鈕:以中心距離判定是否仍在按鈕上 (放寬 10px,邊緣微滑不抖動)
    const inside = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      return Math.hypot(dx, dy) <= Math.max(r.width, r.height) / 2 + 10;
    };
    const release = (pointerId) => {
      if (pointerId === null) {           // 全域重置:放開此按鈕的所有 pointer
        if (active.size === 0) return;
        active.clear();
        el.classList.remove('press');
        up && up();
        return;
      }
      if (!active.delete(pointerId)) return;
      try {
        if (el.hasPointerCapture && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch (_) { /* pointer 已失效 */ }
      if (active.size === 0) {
        el.classList.remove('press');
        up && up();
      }
    };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* 不支援時退化為 hover 事件 */ }
      const wasIdle = active.size === 0;
      active.add(e.pointerId);
      if (wasIdle) {
        el.classList.add('press');
        down();
      }
    });
    // 同一手指滑出按鈕 → 視為放開,狀態不卡住
    el.addEventListener('pointermove', (e) => {
      if (active.has(e.pointerId) && !inside(e)) release(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); release(e.pointerId); });
    el.addEventListener('pointercancel', (e) => release(e.pointerId));
    el.addEventListener('lostpointercapture', (e) => release(e.pointerId));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    allReleases.push(release);
  };

  // ---- 全域安全網:iOS 系統手勢/通知/切 App 可能吞掉 pointerup ----
  // 1) window 層級的 pointerup/cancel:任何按鈕若還握著該 pointerId,強制放開
  const allReleases = [];
  window.addEventListener('pointerup', (e) => { for (const r of allReleases) r(e.pointerId); }, true);
  window.addEventListener('pointercancel', (e) => { for (const r of allReleases) r(e.pointerId); }, true);
  // 2) 頁面失焦/隱藏/離開:清空所有輸入旗標 (含鍵盤),按鈕視覺一併復原
  const resetAll = () => {
    input.forward = input.backward = input.left = input.right = input.handbrake = false;
    input.shiftUp = input.shiftDown = input.boost = false;
    for (const r of allReleases) r(null);   // null = 放開全部
    root.querySelectorAll('.tc-btn.press').forEach((b) => b.classList.remove('press'));
  };
  window.addEventListener('blur', resetAll);
  window.addEventListener('pagehide', resetAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetAll(); });

  bind('tc-left', () => { input.left = true; }, () => { input.left = false; });
  bind('tc-right', () => { input.right = true; }, () => { input.right = false; });
  bind('tc-gas', () => { input.forward = true; }, () => { input.forward = false; });
  bind('tc-brake', () => { input.backward = true; }, () => { input.backward = false; });
  bind('tc-hand', () => { input.handbrake = true; }, () => { input.handbrake = false; });
  bind('tc-up', () => { input.shiftUp = true; });
  bind('tc-down', () => { input.shiftDown = true; });
  bind('tc-cam', () => { onCycleCam && onCycleCam(); });
  bind('tc-boost', () => { input.boost = true; });
  bind('tc-mirror', () => { onMirror && onMirror(); });

  return {
    // body.touch (真觸控裝置或 QA 強制) 時一律顯示;選單開啟時由 CSS :has 規則隱藏
    setVisible(v) {
      const show = v || document.body.classList.contains('touch');
      root.style.display = show ? 'block' : 'none';
    },
    setManual(m) { root.classList.toggle('manual', m); },
  };
}
