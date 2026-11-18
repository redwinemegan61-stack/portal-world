/* Portal World game kit v1 (Coder). One shared file every game includes:
   <script src="../../03-world/kit/portal-kit.js"></script>
   Gives every game the same start screen, how-to, HUD (score, best, pause, back to hub),
   win/lose screen, restart, auto-pause, best-score saving and touch helpers. No dependencies. */
(function(){
  "use strict";
  var COLORS={pink:"#FF2E9A",violet:"#8B5CF6",teal:"#19E3D1",periwinkle:"#8EA2FF",gold:"#FFC857",silver:"#E6ECF5"};
  var css=`
  :root{--pk-bg1:#0A1440;--pk-bg2:#050A24;--pk-cyan:#3EF2FF;--pk-pink:#FF2E9A;--pk-violet:#8B5CF6;--pk-orange:#FF8A3D;--pk-text:#EAF6FF;--pk-accent:#3EF2FF}
  .pk-layer{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:9000;background:radial-gradient(ellipse at 50% 40%,rgba(10,20,64,.55),rgba(5,10,36,.88));backdrop-filter:blur(3px);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:var(--pk-text)}
  .pk-hidden{display:none!important}
  .pk-panel{width:min(92vw,420px);padding:28px 24px 22px;border-radius:20px;text-align:center;background:linear-gradient(160deg,rgba(62,242,255,.10),rgba(139,92,246,.10) 60%,rgba(255,46,154,.08));border:1px solid rgba(62,242,255,.55);box-shadow:0 0 24px rgba(62,242,255,.25),inset 0 0 30px rgba(62,242,255,.08)}
  .pk-title{font-family:Orbitron,Audiowide,Inter,sans-serif;font-weight:800;letter-spacing:.06em;font-size:clamp(26px,7vw,38px);margin:0 0 6px;color:#fff;text-shadow:0 0 12px var(--pk-accent),0 0 28px var(--pk-accent)}
  .pk-sub{opacity:.8;margin:0 0 18px;font-size:14px}
  .pk-how{list-style:none;padding:0;margin:0 0 20px;text-align:left;font-size:14px;line-height:1.5}
  .pk-how li{padding:4px 0 4px 22px;position:relative}.pk-how li:before{content:"";position:absolute;left:4px;top:11px;width:8px;height:8px;border:1.5px solid var(--pk-orange);transform:rotate(45deg)}
  .pk-btn{display:inline-block;margin:6px;padding:12px 26px;border-radius:999px;border:1.5px solid var(--pk-accent);background:rgba(62,242,255,.08);color:#fff;font:700 15px Inter,system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;box-shadow:0 0 12px rgba(62,242,255,.25);transition:transform .12s,box-shadow .12s;touch-action:manipulation}
  .pk-btn:hover,.pk-btn:focus-visible{box-shadow:0 0 22px var(--pk-accent);transform:translateY(-1px);outline:none}
  .pk-btn.pk-ghost{border-color:rgba(234,246,255,.35);box-shadow:none;background:transparent}
  .pk-big{font-family:Inter,sans-serif;font-variant-numeric:tabular-nums;font-size:44px;font-weight:800;margin:8px 0 2px;color:#fff;text-shadow:0 0 14px var(--pk-accent)}
  .pk-hud{position:fixed;top:0;left:0;right:0;z-index:8000;display:flex;align-items:center;gap:8px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;font:600 14px Inter,system-ui,sans-serif;color:var(--pk-text);pointer-events:none}
  .pk-chip{pointer-events:auto;padding:7px 12px;border-radius:12px;background:rgba(10,20,64,.55);border:1px solid rgba(62,242,255,.4);backdrop-filter:blur(4px)}
  .pk-chip b{font-family:Inter,sans-serif;font-variant-numeric:tabular-nums;font-weight:800;color:#fff;margin-left:4px}
  .pk-spacer{flex:1}
  .pk-icon{pointer-events:auto;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(10,20,64,.55);border:1px solid rgba(62,242,255,.4);color:#fff;cursor:pointer;font-size:18px;touch-action:manipulation}
  .pk-new{color:var(--pk-orange);font-weight:800;letter-spacing:.08em;font-size:12px;margin-bottom:6px}
  `;
  var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
  if(!document.querySelector('link[data-pk-font]')){var f=document.createElement("link");f.rel="stylesheet";f.dataset.pkFont="1";f.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Orbitron:wght@600;800&display=swap";document.head.appendChild(f);}

  function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}

  var K={state:"menu",score:0,cfg:null};
  var hud,startL,pauseL,endL,scoreEl,bestEl;

  function bestKey(){return "portalworld.best."+K.cfg.id;}
  function getBest(){var v=parseFloat(localStorage.getItem(bestKey()));return isNaN(v)?0:v;}
  function saveBest(s,won){var has=localStorage.getItem(bestKey())!==null,b=getBest(),better=!has?(won||s>0):(K.cfg.lowerIsBetter?s<b:s>b);if(better){localStorage.setItem(bestKey(),s);}return better;}
  function fmt(n){return K.cfg.formatScore?K.cfg.formatScore(n):Math.round(n).toLocaleString();}

  function build(){
    hud=el("div","pk-hud pk-hidden");
    hud.innerHTML='<span class="pk-chip">Score<b data-s>0</b></span><span class="pk-chip">Best<b data-b>0</b></span><span class="pk-spacer"></span><button class="pk-icon" data-pause aria-label="Pause">II</button><button class="pk-icon" data-hub aria-label="Back to the world">&#x2302;</button>';
    scoreEl=hud.querySelector("[data-s]");bestEl=hud.querySelector("[data-b]");
    hud.querySelector("[data-pause]").onclick=function(){K.pause();};
    hud.querySelector("[data-hub]").onclick=function(){K.backToHub();};
    startL=el("div","pk-layer");
    var how=(K.cfg.howTo||[]).map(function(h){return "<li>"+esc(h)+"</li>";}).join("");
    startL.innerHTML='<div class="pk-panel"><h1 class="pk-title">'+esc(K.cfg.title)+'</h1><p class="pk-sub">'+esc(K.cfg.goal||"")+'</p><ul class="pk-how">'+how+'</ul><div class="pk-sub" data-best></div><button class="pk-btn" data-play>Play</button><button class="pk-btn pk-ghost" data-hub>Back to the world</button></div>';
    startL.querySelector("[data-play]").onclick=function(){K.start();};
    startL.querySelector("[data-hub]").onclick=function(){K.backToHub();};
    pauseL=el("div","pk-layer pk-hidden");
    pauseL.innerHTML='<div class="pk-panel"><h2 class="pk-title">Paused</h2><button class="pk-btn" data-resume>Resume</button><button class="pk-btn pk-ghost" data-restart>Restart</button><button class="pk-btn pk-ghost" data-hub>Back to the world</button></div>';
    pauseL.querySelector("[data-resume]").onclick=function(){K.resume();};
    pauseL.querySelector("[data-restart]").onclick=function(){K.restart();};
    pauseL.querySelector("[data-hub]").onclick=function(){K.backToHub();};
    endL=el("div","pk-layer pk-hidden");
    document.body.appendChild(hud);document.body.appendChild(startL);document.body.appendChild(pauseL);document.body.appendChild(endL);
    refreshBest();
  }
  function refreshBest(){var b=getBest();bestEl.textContent=fmt(b);var sb=startL.querySelector("[data-best]");sb.textContent=b?("Best: "+fmt(b)):"";}
  function call(name){var fn=K.cfg[name];if(typeof fn==="function"){try{fn.apply(null,[].slice.call(arguments,1));}catch(e){console.error("[PortalKit] "+name+" failed",e);}}}

  K.init=function(cfg){
    if(!cfg||!cfg.id||!cfg.title){throw new Error("PortalKit.init needs at least {id, title}");}
    K.cfg=cfg;var accent=COLORS[cfg.color]||cfg.color||COLORS.teal;
    document.documentElement.style.setProperty("--pk-accent",accent);
    if(document.body){build();}else{document.addEventListener("DOMContentLoaded",build);}
    document.addEventListener("keydown",function(e){
      if(e.key==="Escape"||e.key==="p"||e.key==="P"){if(K.state==="playing")K.pause();else if(K.state==="paused")K.resume();}
      else if((e.key==="Enter"||e.key===" ")&&(K.state==="menu"||K.state==="over")){e.preventDefault();K.state==="menu"?K.start():K.restart();}
    });
    document.addEventListener("visibilitychange",function(){if(document.hidden&&K.state==="playing")K.pause();});
    return K;
  };
  K.start=function(){K.score=0;scoreEl.textContent=fmt(0);startL.classList.add("pk-hidden");endL.classList.add("pk-hidden");hud.classList.remove("pk-hidden");K.state="playing";call("onStart");};
  K.restart=function(){pauseL.classList.add("pk-hidden");call("onRestart");K.start();};
  K.pause=function(){if(K.state!=="playing")return;K.state="paused";pauseL.classList.remove("pk-hidden");call("onPause");};
  K.resume=function(){if(K.state!=="paused")return;K.state="playing";pauseL.classList.add("pk-hidden");call("onResume");};
  K.setScore=function(n){K.score=n;if(scoreEl)scoreEl.textContent=fmt(n);};
  K.addScore=function(n){K.setScore(K.score+(n||1));};
  K.isPlaying=function(){return K.state==="playing";};
  function end(won,final,msg){
    if(K.state==="over")return;K.state="over";if(final!=null)K.setScore(final);
    var isNew=(won||K.score>0)&&saveBest(K.score,won);refreshBest();
    endL.innerHTML='<div class="pk-panel">'+(isNew?'<div class="pk-new">NEW BEST</div>':'')+'<h2 class="pk-title">'+(won?"You win!":"Game over")+'</h2><p class="pk-sub">'+esc(msg||"")+'</p><div class="pk-big">'+fmt(K.score)+'</div><p class="pk-sub">Best '+fmt(getBest())+'</p><button class="pk-btn" data-again>Play again</button><button class="pk-btn pk-ghost" data-hub>Back to the world</button></div>';
    endL.querySelector("[data-again]").onclick=function(){K.restart();};
    endL.querySelector("[data-hub]").onclick=function(){K.backToHub();};
    endL.classList.remove("pk-hidden");call(won?"onWin":"onLose",K.score);
  }
  K.win=function(score,msg){end(true,score,msg);};
  K.lose=function(score,msg){end(false,score,msg);};
  K.backToHub=function(){var id=K.cfg?K.cfg.id:"";location.href=(K.cfg&&K.cfg.hubUrl)||("../../03-world/index.html#from="+encodeURIComponent(id));};

  /* Touch + mouse helpers. Each returns an unsubscribe function. */
  K.onSwipe=function(target,cb,min){target=target||document;min=min||30;var sx,sy,t0;
    function s(e){var p=e.touches?e.touches[0]:e;sx=p.clientX;sy=p.clientY;t0=Date.now();}
    function u(e){if(sx==null)return;var p=e.changedTouches?e.changedTouches[0]:e;var dx=p.clientX-sx,dy=p.clientY-sy;sx=null;if(Date.now()-t0>800)return;if(Math.max(Math.abs(dx),Math.abs(dy))<min)return;cb(Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up"));}
    target.addEventListener("touchstart",s,{passive:true});target.addEventListener("touchend",u);target.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse")s(e);});target.addEventListener("pointerup",function(e){if(e.pointerType==="mouse")u(e);});
    return function(){target.removeEventListener("touchstart",s);target.removeEventListener("touchend",u);};};
  K.onTap=function(target,cb){target=target||document;function h(e){if(K.state!=="playing")return;var p=e.changedTouches?e.changedTouches[0]:e;cb(p.clientX,p.clientY,e);}target.addEventListener("pointerdown",h);return function(){target.removeEventListener("pointerdown",h);};};
  K.colors=COLORS;
  window.PortalKit=K;
})();
