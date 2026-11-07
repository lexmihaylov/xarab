// These examples illustrate routing; they do not invoke the classifier.
const trace = document.querySelector('.routing-trace');
if (trace) {
  const examples = {
    1: ['“Explain what this function does”', 'Tier 1 → configured worker 1. A straightforward explanation follows a known approach.'],
    2: ['“Investigate why this bug spans modules”', 'Tier 2 → configured worker 2. Investigation requires discovering a bounded approach.'],
    3: ['“Resolve competing causes in this security design”', 'Tier 3 → configured worker 3. Competing explanations and security constraints require deeper reasoning.'],
    adjustment: ['Tier adjustment', 'Illustrative adjustment: the Tier 3 worker requests a lower tier. If approved, classification routes the handoff to the Tier 2 worker.']
  };
  const controls = trace.querySelector('.trace-controls');
  const buttons = [...controls.querySelectorAll('[data-route]')];
  const branches = [...trace.querySelectorAll('[data-tier]')];
  const prompt = trace.querySelector('.route-prompt');
  const caption = trace.querySelector('.route-caption');
  let selected = '1';

  function play() {
    trace.classList.remove('is-playing');
    void trace.offsetWidth; // Restart the CSS sequence when replaying the same example.
    trace.classList.add('is-playing');
  }

  function select(tier) {
    selected = tier;
    prompt.textContent = examples[tier][0];
    caption.textContent = examples[tier][1];
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.route === tier)));
    branches.forEach(branch => branch.classList.toggle('route-active', branch.dataset.tier === tier));
    trace.classList.toggle('is-adjustment', tier === 'adjustment');
    play();
  }

  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.route)));
  controls.querySelector('.trace-replay').addEventListener('click', () => select(selected));
  controls.hidden = false;
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        play();
        observer.disconnect();
      }
    }, { threshold: 0.35 });
    observer.observe(trace);
  }
}

// Canvas is a progressive enhancement; the HTML diagram remains the fallback.
if (trace) {
  const canvas = trace.querySelector('.route-canvas');
  let ctx;
  try { ctx = canvas && canvas.getContext('2d'); } catch (error) {
    console.error('Routing canvas is unavailable:', error);
  }
  if (ctx) {
    const fallback = trace.querySelector('.route-diagram');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let tier = 1, mode = '1', start = 0, frame = 0, progress = 1;
    let visible = !('IntersectionObserver' in window);
    const labels = ['Focused', 'Advanced', 'Specialized'];
    canvas.hidden = false;
    function draw() {
      const width = canvas.clientWidth;
      if (!width) return;
      const mobile = width < 620;
      const height = mobile ? 535 : 350;
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.style.height = height + 'px';
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const bg = '#192731', line = '#435b69', muted = '#a6b9c2', light = '#e8f2f4', accent = '#a8d8ec';
      const source = mobile ? {x: width * .25, y: 92} : {x: 92, y: 150};
      const context = mobile ? {x: width * .75, y: 92} : {x: width * .55, y: 55};
      const classifier = mobile ? {x: width / 2, y: 205} : {x: width * .55, y: 150};
      const split = mobile ? 282 : width * .71;
      const targets = labels.map((_, i) => mobile ? {x: width * (i + .5) / 3, y: 345} : {x: width - 110, y: 70 + i * 80});
      const adjustmentTool = mobile ? {x: width / 2, y: 448} : {x: width * .34, y: 300};
      function path(points, color, thickness) {
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.stroke();
      }
      function box(x, y, w, h, selected) {
        ctx.fillStyle = selected ? '#263e4a' : bg; ctx.strokeStyle = selected ? accent : line;
        ctx.lineWidth = 1; ctx.fillRect(x-w/2,y-h/2,w,h); ctx.strokeRect(x-w/2,y-h/2,w,h);
      }
      function text(value, x, y, color, size, align = 'center') {
        ctx.fillStyle = color; ctx.font = `${size}px ui-monospace, monospace`; ctx.textAlign = align; ctx.fillText(value,x,y);
      }
      const promptRoute = mobile
        ? [{x:source.x+45,y:source.y},{x:classifier.x-45,y:classifier.y}]
        : [{x:source.x+65,y:source.y},{x:classifier.x-65,y:classifier.y}];
      const contextRoute = mobile
        ? [{x:context.x,y:context.y+29},{x:context.x,y:classifier.y-32}]
        : [{x:context.x,y:context.y+29},{x:context.x,y:classifier.y-32}];
      const routes = targets.map(t => mobile ? [{x:classifier.x,y:235},{x:classifier.x,y:split},{x:t.x,y:split},{x:t.x,y:t.y-32}] : [{x:classifier.x+65,y:classifier.y},{x:split,y:classifier.y},{x:split,y:t.y},{x:t.x-88,y:t.y}]);
      const adjustmentRoute = mobile
        ? [{x:targets[2].x,y:377},{x:targets[2].x,y:448},{x:adjustmentTool.x+Math.min(width-36,260)/2,y:448}]
        : [{x:targets[2].x,y:targets[2].y+32},{x:targets[2].x,y:300},{x:adjustmentTool.x+87,y:300}];
      const returnRoute = mobile
        ? [{x:adjustmentTool.x-Math.min(width-36,260)/2,y:448},{x:12,y:448},{x:12,y:205},{x:classifier.x-65,y:205}]
        : [{x:adjustmentTool.x,y:276},{x:adjustmentTool.x,y:150},{x:classifier.x-65,y:150}];
      const newWorkerRoute = routes[1];
      path(promptRoute,line,1); path(contextRoute,line,1); routes.forEach(r => path(r,line,1));
      if (mode === 'adjustment') { path(adjustmentRoute,line,1); path(returnRoute,line,1); path(newWorkerRoute,line,1); }
      function partial(points, amount) {
        const lengths = points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
        let remaining = lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,amount));
        const out=[points[0]];
        for(let i=0;i<lengths.length;i++) { const f=lengths[i] ? Math.min(1,remaining/lengths[i]) : 1; out.push({x:points[i].x+(points[i+1].x-points[i].x)*f,y:points[i].y+(points[i+1].y-points[i].y)*f}); remaining-=lengths[i]; if(f<1)break; }
        path(out,accent,2); const end=out[out.length-1]; if(amount>0 && amount<1){ctx.fillStyle=accent;ctx.beginPath();ctx.arc(end.x,end.y,4,0,Math.PI*2);ctx.fill();}
      }
      // All highlights and signals derive from the same arrival boundaries.
      const phase = mode === 'adjustment' ? progress * 2 : progress;
      const segment = (start, end) => Math.max(0, Math.min(1, (phase - start) / (end - start)));
      partial(promptRoute, segment(0, .4));
      partial(contextRoute, segment(0, .4));
      partial(routes[tier-1], segment(.4, 1));
      box(source.x,source.y,mobile?Math.max(0,width/2-12):130,48,false);
      text('PROMPT',source.x,source.y+4,muted,11);
      box(context.x,context.y,mobile?Math.max(0,width/2-12):128,58,true);
      text('PARTIAL CONTEXT',context.x,context.y-5,accent,10);
      text('relevant history',context.x,context.y+13,muted,9);
      box(classifier.x,classifier.y,130,64,phase>=.4);
      text('CLASSIFIER',classifier.x,classifier.y-5,accent,11); text('estimates capability',classifier.x,classifier.y+15,muted,9);
      targets.forEach((t,i)=>{ const active=mode === 'adjustment' ? (i === 2 && phase >= 1 && phase < 2) || (i === 1 && phase >= 2) : i===tier-1 && phase>=1; const w=mobile?Math.max(80,width/3-10):176; box(t.x,t.y,w,64,active); text('TIER 0'+(i+1),t.x,t.y-12,active?accent:muted,10); text(labels[i],t.x,t.y+4,light,mobile?9:11); text('WORKER 0'+(i+1),t.x,t.y+20,muted,9); });
      if (mode === 'adjustment') {
        const toolWidth = mobile ? Math.min(width - 36, 260) : 174;
        const toolHeight = 48;
        path(adjustmentRoute, line, 1);
        path(returnRoute, line, 1);
        path(newWorkerRoute, line, 1);
        partial(adjustmentRoute, segment(1, 1.33));
        partial(returnRoute, segment(1.33, 1.66));
        partial(newWorkerRoute, segment(1.66, 2));
        box(adjustmentTool.x, adjustmentTool.y, toolWidth, toolHeight, phase >= 1.33);
        text('TIER ADJUSTMENT TOOL', adjustmentTool.x, adjustmentTool.y + 4, phase >= 1.33 ? accent : light, mobile ? 9 : 10);
      }
    }
    function play() {
      cancelAnimationFrame(frame);
      if (reduce.matches || !visible) { progress=1; draw(); return; }
      progress=0;
      draw();
      start=performance.now();
      const duration = mode === 'adjustment' ? 4400 : 2200;
      function tick(now) {
        progress=Math.min(1,(now-start)/duration);
        draw();
        if(progress<1) frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);
    }
    trace.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>{
      mode=button.dataset.route;
      if (mode === 'adjustment') tier=3;
      else tier=Number(mode);
      play();
    }));
    trace.querySelector('.trace-replay').addEventListener('click',play);
    window.addEventListener('resize',draw);
    reduce.addEventListener('change',()=>{if(reduce.matches){cancelAnimationFrame(frame);progress=1;draw();}else if(visible) play();});
    try {
      draw();
      fallback.hidden = true;
    } catch (error) {
      canvas.hidden = true;
      console.error('Routing canvas could not be drawn:', error);
    }
    if ('IntersectionObserver' in window) {
      const observer=new IntersectionObserver(entries=>{
        visible=entries.some(entry=>entry.isIntersecting);
        if(visible) play();
        else { cancelAnimationFrame(frame); progress=1; draw(); }
      }, {threshold:.35});
      observer.observe(trace);
    } else play();
  }
}
