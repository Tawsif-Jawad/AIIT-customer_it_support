/* Original, dependency-free public interactions and demand-driven dot renderer. */
(() => {
  const menu = document.querySelector('.menu-toggle');
  const links = document.querySelector('.public-links');
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); links.classList.toggle('open', open); });
  links?.addEventListener('click', e => { if (e.target.closest('a')) { links.classList.remove('open'); menu.setAttribute('aria-expanded','false'); } });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && links?.classList.contains('open')) {links.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.focus();} });
  const demos = [ ['EMPLOYEE REQUEST', '“My Outlook isn’t connecting. Can you help me get back to work?”'], ['AI RECOMMENDATION', 'Find approved Outlook configuration guidance. Check TLS settings, then ask the requester to verify.'], ['POLICY & HANDOFF', 'No mailbox access performed. If the steps don’t resolve the issue, route the request to an IT engineer.'] ];
  document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-demo]').forEach(b => {b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));}); const demo=demos[Number(button.dataset.demo)];document.querySelector('#demo-label').textContent=demo[0];document.querySelector('#demo-text').textContent=demo[1]; }));
  const portals={employee:['Get back to what you do best.','Create requests, follow progress and get guided support without losing context.',['Personal support queue','AI-guided troubleshooting','Equipment & knowledge']],it:['Less chasing. More resolving.','Work the authorized queue, investigate recommendations and keep every handoff accountable.',['Scoped ticket operations','Approval center','Assets, audit & service health']],cto:['Clarity for the decisions that matter.','Review escalations, assess critical requests and oversee approvals within your authority.',['Executive escalation queue','Critical request review','Cross-SBU operational summary']]};
  const portalButtons = [...document.querySelectorAll('[data-portal]')];
  portalButtons.forEach((button,index) => {button.addEventListener('click',()=>{portalButtons.forEach(b=>{b.setAttribute('aria-selected',String(b===button));b.tabIndex=b===button?0:-1;});const [title,copy,modules]=portals[button.dataset.portal];document.querySelector('#portal-title').textContent=title;document.querySelector('#portal-description').textContent=copy;document.querySelector('#portal-modules').replaceChildren(...modules.map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));document.querySelector('#portal-story').setAttribute('aria-labelledby',button.id);});button.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(index+1)%portalButtons.length;if(e.key==='ArrowLeft')next=(index+portalButtons.length-1)%portalButtons.length;if(e.key==='Home')next=0;if(e.key==='End')next=portalButtons.length-1;if(next!==undefined){e.preventDefault();portalButtons[next].click();portalButtons[next].focus();}});});
  document.querySelectorAll('[data-year]').forEach(el => el.textContent=String(new Date().getFullYear()));

  const canvas=document.querySelector('#dot-wordmark');
  if(!canvas)return;
  const ctx=canvas.getContext('2d'); if(!ctx)return;
  const wrap=canvas.parentElement, footer=document.querySelector('.signature-footer'), glass=document.querySelector('.signature-glass');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let points=[],w=0,h=0,frame=0,visible=false,last=0,settling=0,destroyed=false;
  let pointer={x:-1000,y:-1000},ripple={x:0,y:0,time:-10000};
  const disposers=[];
  const on=(el,event,fn,options)=>{el.addEventListener(event,fn,options);disposers.push(()=>el.removeEventListener(event,fn,options));};
  function build(){
    const box=wrap.getBoundingClientRect();w=Math.round(box.width);h=Math.round(box.height);if(!w||!h)return;
    const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const mask=document.createElement('canvas');mask.width=w;mask.height=h;const m=mask.getContext('2d',{willReadFrequently:true});if(!m)return;
    let size=h*1.32;m.font='900 '+size+'px Arial, sans-serif';const measured=m.measureText('AIIT');size*=Math.min((w*.96)/measured.width,1);m.font='900 '+size+'px Arial, sans-serif';m.textAlign='center';m.textBaseline='alphabetic';
    const metrics=m.measureText('AIIT'),ascent=metrics.actualBoundingBoxAscent||size*.72,descent=metrics.actualBoundingBoxDescent||0;
    m.save();m.translate(w/2,0);m.scale(w*.96/metrics.width,1);m.fillText('AIIT',0,(h+ascent-descent)/2);m.restore();
    const data=m.getImageData(0,0,w,h).data;
    const spacing=Math.max(5,Math.sqrt(w*h/7200));points=[];
    for(let y=spacing;y<h-spacing/2;y+=spacing)for(let x=spacing;x<w-spacing/2;x+=spacing)if(data[(Math.floor(y)*w+Math.floor(x))*4+3]>140)points.push({x,y,dx:0,dy:0,heat:0});
    canvas.dataset.dotCount=String(points.length);canvas.dataset.spacing=spacing.toFixed(2);canvas.dataset.state='idle';wrap.classList.add('ready');draw(performance.now());
  }
  function draw(now){
    const started=performance.now();
    frame=0;if(destroyed||!w)return;
    ctx.clearRect(0,0,w,h);const spacing=Number(canvas.dataset.spacing)||6,radius=spacing*.25,reach=Math.min(150,w*.2);let active=false,maxDisplacement=0;const buckets=Array.from({length:16},()=>[]);
    for(const p of points){const dx=p.x-pointer.x,dy=p.y-pointer.y,d=Math.hypot(dx,dy),heat=reduced.matches?0:Math.pow(Math.max(0,1-d/reach),2);const age=(now-ripple.time)/1000;const wave=!reduced.matches&&age<1.1?Math.exp(-Math.pow((Math.hypot(p.x-ripple.x,p.y-ripple.y)-age*230)/35,2))*Math.max(0,1-age):0;
      const rd=Math.hypot(p.x-ripple.x,p.y-ripple.y)||1;const targetX=(d?dx/d*heat*9:0)+(p.x-ripple.x)/rd*wave*3,targetY=(d?dy/d*heat*9:0)+(p.y-ripple.y)/rd*wave*3;
      p.dx+=(targetX-p.dx)*.16;p.dy+=(targetY-p.dy)*.16;p.heat+=(heat-p.heat)*.16;
      if(Math.abs(p.dx-targetX)+Math.abs(p.dy-targetY)>.03||Math.abs(p.heat-heat)>.003||wave>.005)active=true;
      maxDisplacement=Math.max(maxDisplacement,Math.hypot(p.dx,p.dy));
      const bucket=Math.min(15,Math.floor(p.heat*15));buckets[bucket].push([p.x+p.dx,p.y+p.dy,radius*(1+p.heat*.5+wave*.15)]);
    }
    for(let i=0;i<buckets.length;i++){if(!buckets[i].length)continue;const tint=i/15*.75;ctx.fillStyle='rgb('+Math.round(248-49*tint)+','+Math.round(246-99*tint)+','+Math.round(241+14*tint)+')';ctx.beginPath();for(const [x,y,r] of buckets[i]){ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);}ctx.fill();}
    canvas.dataset.displacement=maxDisplacement.toFixed(2);canvas.dataset.state=active?'reacting':'idle';
    const elapsed=performance.now()-started;if(last)canvas.dataset.frameMs=elapsed.toFixed(2);last=now;
    if(visible&&!document.hidden&&!reduced.matches&&active){frame=requestAnimationFrame(draw);settling++;}else settling=0;
  }
  function wake(){if(!frame&&visible&&!document.hidden&&!destroyed)frame=requestAnimationFrame(draw);}
  function move(e){if(e.pointerType==='touch'||reduced.matches)return;const r=canvas.getBoundingClientRect();const next={x:e.clientX-r.left,y:e.clientY-r.top};if(performance.now()-ripple.time>180&&Math.hypot(next.x-pointer.x,next.y-pointer.y)>10)ripple={...next,time:performance.now()};pointer=next;wake();}
  function exit(){pointer={x:-1000,y:-1000};wake();}
  on(canvas,'pointermove',move,{passive:true});on(canvas,'pointerleave',exit);
  on(document,'pointerdown',e=>{if(e.target!==canvas)exit();},{passive:true});
  on(window,'blur',exit);
  on(canvas,'pointerdown',e=>{if(reduced.matches)return;const r=canvas.getBoundingClientRect();ripple={x:e.clientX-r.left,y:e.clientY-r.top,time:performance.now()};wake();},{passive:true});
  on(glass,'pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;const r=glass.getBoundingClientRect();glass.style.setProperty('--light-x',(e.clientX-r.left)+'px');glass.style.setProperty('--light-y',(e.clientY-r.top)+'px');footer.style.setProperty('--parallax-x',((e.clientX-r.left)/r.width-.5)*10+'px');footer.style.setProperty('--parallax-y',((e.clientY-r.top)/r.height-.5)*8+'px');},{passive:true});
  on(glass,'pointerleave',()=>{footer.style.setProperty('--parallax-x','0px');footer.style.setProperty('--parallax-y','0px');});
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;canvas.dataset.visible=String(visible);if(visible){glass.classList.add('reveal');wake();}else if(frame){cancelAnimationFrame(frame);frame=0;}},{threshold:.05});observer.observe(footer);
  const resize=new ResizeObserver(build);resize.observe(wrap);
  on(document,'visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else wake();});
  on(reduced,'change',()=>{pointer={x:-1000,y:-1000};points.forEach(p=>{p.dx=0;p.dy=0;p.heat=0;});draw(performance.now());});
  function cleanup(){destroyed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();disposers.forEach(fn=>fn());}
  on(window,'pagehide',event=>{if(!event.persisted)cleanup();});
  build();
})();
