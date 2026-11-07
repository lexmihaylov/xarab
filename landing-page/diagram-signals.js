// Animate a signal along named Mermaid edges using native SVG motion.
(() => {
  const ns = 'http://www.w3.org/2000/svg';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function scan() {
    document.querySelectorAll('.mermaid svg').forEach(svg => {
      if (svg.dataset.signalReady || motion.matches) return;
      const routes = svg.closest('.adjustment-mermaid')
        ? [['A_B', 'B_C', 'C_D'], ['A_B', 'B_E']]
        : [['C_T1', 'T1_W1', 'W1_R'], ['C_T2', 'T2_W2', 'W2_R'], ['C_T3', 'T3_W3', 'W3_R']];
      const paths = routes.map(route => route.map(key =>
        [...svg.querySelectorAll('path.flowchart-link')].find(path =>
          path.getAttribute('data-id') === `L_${key}_0`)));
      if (paths.flat().some(path => !path?.getAttribute('d'))) return;
      svg.dataset.signalReady = 'true';
      const duration = routes.length * 6;
      paths.forEach((route, routeIndex) => route.forEach((path, step) => {
        // Keep each signal in the same coordinate space as its connector.
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('class', 'diagram-signal');
        dot.setAttribute('r', '7');
        dot.setAttribute('opacity', '0');
        dot.setAttribute('aria-hidden', 'true');
        const start = routeIndex * 6 + step * 1.5;
        const end = start + 1.5;
        const travel = document.createElementNS(ns, 'animateMotion');
        travel.setAttribute('path', path.getAttribute('d'));
        travel.setAttribute('dur', `${duration}s`);
        travel.setAttribute('repeatCount', 'indefinite');
        travel.setAttribute('calcMode', 'linear');
        travel.setAttribute('keyPoints', '0;0;1;1');
        travel.setAttribute('keyTimes', `0;${start / duration};${end / duration};1`);
        // Avoid duplicate keyTimes at the beginning of the first route.
        if (start === 0) {
          travel.setAttribute('keyPoints', '0;1;1');
          travel.setAttribute('keyTimes', `0;${end / duration};1`);
        }
        const visibility = document.createElementNS(ns, 'animate');
        visibility.setAttribute('attributeName', 'opacity');
        visibility.setAttribute('dur', `${duration}s`);
        visibility.setAttribute('repeatCount', 'indefinite');
        visibility.setAttribute('calcMode', 'discrete');
        visibility.setAttribute('values', start === 0 ? '1;0;0' : '0;1;0;0');
        visibility.setAttribute('keyTimes', start === 0
          ? `0;${end / duration};1`
          : `0;${start / duration};${end / duration};1`);
        dot.append(travel, visibility);
        path.parentNode.append(dot);
        travel.beginElement();
        visibility.beginElement();
      }));
    });
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  motion.addEventListener('change', () => {
    document.querySelectorAll('.diagram-signal').forEach(dot => dot.remove());
    document.querySelectorAll('[data-signal-ready]').forEach(svg => delete svg.dataset.signalReady);
    scan();
  });
  scan();
})();
