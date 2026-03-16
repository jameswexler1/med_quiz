'use strict';
const State={questions:[],current:0,score:0,answers:[]};
let chartFinal=null,chartHistory=null;

document.addEventListener('DOMContentLoaded',()=>{
  initTheme();
  registerSW();
  initInstallBanner();
  bindEvents();
  if(document.getElementById('screen-home'))showScreen('screen-home');
});

function bindEvents(){
  document.getElementById('theme-toggle')?.addEventListener('click',toggleTheme);
  document.querySelectorAll('.lang-btn').forEach(b=>b.addEventListener('click',()=>window.setLang(b.dataset.lang)));
  document.getElementById('load-btn')?.addEventListener('click',loadQuiz);
  document.getElementById('history-btn')?.addEventListener('click',()=>showScreen('screen-history'));
  document.getElementById('file-trigger')?.addEventListener('click',()=>document.getElementById('file-input')?.click());
  document.getElementById('file-input')?.addEventListener('change',handleFileUpload);
  document.getElementById('quiz-back')?.addEventListener('click',()=>{if(confirm(window.t('quiz.exitMsg')))showScreen('screen-home')});
  document.getElementById('next-btn')?.addEventListener('click',nextQuestion);
  document.getElementById('save-btn')?.addEventListener('click',()=>saveResult());
  document.getElementById('final-new-btn')?.addEventListener('click',()=>showScreen('screen-home'));
  document.getElementById('history-back')?.addEventListener('click',()=>showScreen('screen-home'));
  document.getElementById('clear-btn')?.addEventListener('click',clearHistory);
  document.getElementById('json-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))loadQuiz()});
}

/* THEME */
function initTheme(){applyTheme(localStorage.getItem('mq_theme')||'dark')}
function toggleTheme(){applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark')}
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme',theme);
  localStorage.setItem('mq_theme',theme);
  const meta=document.getElementById('theme-meta');
  if(meta)meta.content=theme==='dark'?'#070d1a':'#eef2f7';
  const btn=document.getElementById('theme-toggle');
  if(btn)btn.innerHTML=theme==='dark'
    ?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    :`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  if(chartFinal&&State.questions.length>0)renderFinalChart();
  const hist=getHistory();
  if(chartHistory&&hist.length>1)renderHistoryChart(hist);
}

/* SCREENS */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if(id==='screen-history'){
    // Pull latest from Supabase before rendering history
    if(typeof Sync!=='undefined'&&Sync.isLoggedIn()){
      Sync.pull().then(()=>renderHistory()).catch(()=>renderHistory());
    } else {
      renderHistory();
    }
  }
}

/* FILE UPLOAD */
function handleFileUpload(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    document.getElementById('json-input').value=ev.target.result;
    e.target.value='';
    showToast(window.MQ_LANG==='pt'?'Arquivo carregado!':'File loaded!','success');
  };
  r.readAsText(file);
}

/* LOAD */
function loadQuiz(){
  const raw=(document.getElementById('json-input')?.value||'').trim();
  if(!raw){showToast(window.t('home.emptyErr'),'error');return}
  let data;
  try{data=JSON.parse(raw)}catch(e){showToast(window.t('home.jsonErr'),'error');return}
  if(!Array.isArray(data)||!data.length||!data[0].title||!Array.isArray(data[0].choices)||data[0].correctIndex===undefined){
    showToast(window.t('home.jsonErr'),'error');return
  }
  State.questions=data;State.current=0;State.score=0;State.answers=[];
  showScreen('screen-quiz');renderQuestion();
}

/* RENDER QUESTION */
function renderQuestion(){
  const q=State.questions[State.current];
  const n=State.current+1,total=State.questions.length;
  document.getElementById('progress-text').textContent=`${window.t('quiz.question')} ${n} ${window.t('quiz.of')} ${total}`;
  document.getElementById('progress-fill').style.width=((State.current/total)*100)+'%';
  document.getElementById('question-text').textContent=q.title;
  const letters=['A','B','C','D','E'];
  const container=document.getElementById('choices');
  container.innerHTML='';
  q.choices.forEach((choice,i)=>{
    const btn=document.createElement('button');
    btn.className='choice-btn';
    btn.innerHTML=`<span class="choice-letter">${letters[i]||i+1}</span><span>${esc(choice)}</span>`;
    btn.addEventListener('click',()=>handleAnswer(i));
    container.appendChild(btn);
  });
  document.getElementById('feedback-card').className='card feedback-card hidden';
  const nb=document.getElementById('next-btn');
  nb.classList.add('hidden');
  nb.querySelector('[data-i18n]').textContent=n===total?window.t('quiz.finish'):window.t('quiz.next');
}

/* ANSWER */
function handleAnswer(idx){
  const q=State.questions[State.current];
  const correct=q.correctIndex,isOk=idx===correct;
  document.querySelectorAll('.choice-btn').forEach((btn,i)=>{
    btn.disabled=true;
    if(i===correct)btn.classList.add('correct');
    if(i===idx&&!isOk)btn.classList.add('incorrect');
  });
  if(isOk)State.score++;
  State.answers.push({idx,correct:isOk});
  const fb=document.getElementById('feedback-card');
  fb.className=`card feedback-card ${isOk?'correct-fb':'incorrect-fb'}`;
  const st=fb.querySelector('.feedback-status');
  st.className=`feedback-status ${isOk?'correct-status':'incorrect-status'}`;
  st.innerHTML=isOk
    ?`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>${window.t('quiz.correct')}`
    :`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>${window.t('quiz.wrong')}`;
  fb.querySelector('.feedback-text').textContent=q.explanation||'';
  fb.classList.remove('hidden');
  document.getElementById('next-btn').classList.remove('hidden');
}

function nextQuestion(){
  State.current++;
  if(State.current<State.questions.length){renderQuestion();window.scrollTo({top:0,behavior:'smooth'})}
  else showFinal();
}

/* FINAL */
function showFinal(){
  showScreen('screen-final');
  const total=State.questions.length,pct=Math.round((State.score/total)*100);
  document.getElementById('score-big').textContent=`${State.score}/${total}`;
  document.getElementById('score-sub').textContent=`${pct}%`;
  const ring=document.getElementById('score-ring-fill');
  const color=pct>=70?'var(--accent)':pct>=50?'var(--yellow)':'var(--red)';
  setTimeout(()=>{ring.style.strokeDashoffset=427-(427*pct/100);ring.style.stroke=color},80);
  const badge=document.getElementById('grade-badge');
  let cls,lbl;
  if(pct>=85){cls='grade-excellent';lbl='🏆 '+window.t('final.excellent')}
  else if(pct>=70){cls='grade-good';lbl='✨ '+window.t('final.good')}
  else if(pct>=50){cls='grade-average';lbl='📘 '+window.t('final.average')}
  else{cls='grade-poor';lbl='💪 '+window.t('final.poor')}
  badge.className=`grade-badge ${cls}`;badge.textContent=lbl;
  renderFinalChart();
  document.getElementById('quiz-name-input').value='';
}

function renderFinalChart(){
  if(chartFinal){chartFinal.destroy();chartFinal=null}
  const ctx=document.getElementById('performance-chart');if(!ctx)return;
  const isDark=document.documentElement.getAttribute('data-theme')!=='light';
  chartFinal=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:[window.MQ_LANG==='pt'?'Acertos':'Correct',window.MQ_LANG==='pt'?'Erros':'Incorrect'],
      datasets:[{data:[State.score,State.questions.length-State.score],backgroundColor:['#10b981','#f87171'],borderWidth:0,borderRadius:6,spacing:3}]
    },
    options:{responsive:true,cutout:'64%',animation:{animateRotate:true,duration:900},
      plugins:{legend:{position:'bottom',labels:{color:isDark?'#94a3b8':'#475569',padding:16,font:{size:13}}}}}
  });
}

/* SAVE */
function saveResult(){
  const locale=window.MQ_LANG==='pt'?'pt-BR':'en-US';
  const name=(document.getElementById('quiz-name-input')?.value||'').trim()||`Quiz ${new Date().toLocaleDateString(locale)}`;
  const history=getHistory();
  history.push({id:Date.now(),name,date:new Date().toLocaleString(locale),score:State.score,total:State.questions.length,percent:Math.round((State.score/State.questions.length)*100),questions:State.questions});
  localStorage.setItem('mq_history',JSON.stringify(history));
  showToast(window.t('final.saveOk'),'success');
  // Push to Supabase if logged in
  if (typeof Sync!=='undefined'&&Sync.isLoggedIn()) {
    Sync.push().catch(console.warn);
  }
  setTimeout(()=>showScreen('screen-home'),1600);
}

/* HISTORY */
function getHistory(){try{return JSON.parse(localStorage.getItem('mq_history')||'[]')}catch(e){return[]}}

function renderHistory(){
  const history=getHistory(),list=document.getElementById('history-list');
  if(!list)return;list.innerHTML='';
  if(!history.length){
    list.innerHTML=`<div class="history-empty">${window.t('history.empty')}</div>`;
    if(chartHistory){chartHistory.destroy();chartHistory=null}
    document.getElementById('history-chart-wrap')?.classList.add('hidden');return;
  }
  document.getElementById('history-chart-wrap')?.classList.remove('hidden');
  [...history].reverse().forEach((h,i)=>{
    const item=document.createElement('div');
    item.className='history-item';item.style.animationDelay=(i*45)+'ms';
    const pc=h.percent>=70?'var(--green)':h.percent>=50?'var(--yellow)':'var(--red)';
    item.innerHTML=`<div class="history-item-info"><div class="history-item-name">${esc(h.name)}</div><div class="history-item-date">${h.date}</div></div><div class="history-item-score"><div class="history-score-num" style="color:${pc}">${h.score}/${h.total}</div><div class="history-score-pct">${h.percent}%</div></div>${h.questions?`<button class="btn btn-secondary btn-sm redo-btn" data-idx="${history.length-1-i}" aria-label="Redo" title="Refazer / Redo" style="margin-left:8px;flex-shrink:0;padding:7px 10px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.98"/></svg></button>`:""}`;
    list.appendChild(item);
  });
  renderHistoryChart(history);
}

function renderHistoryChart(history){
  if(chartHistory){chartHistory.destroy();chartHistory=null}
  const ctx=document.getElementById('history-chart');if(!ctx||history.length<2)return;
  const isDark=document.documentElement.getAttribute('data-theme')!=='light';
  const txtColor=isDark?'#94a3b8':'#475569',gridColor=isDark?'rgba(148,163,184,.07)':'rgba(0,0,0,.06)';
  chartHistory=new Chart(ctx,{
    type:'line',
    data:{labels:history.map((_,i)=>`#${i+1}`),datasets:[{label:window.MQ_LANG==='pt'?'Aproveitamento %':'Score %',data:history.map(h=>h.percent),borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.08)',pointBackgroundColor:'#10b981',pointRadius:5,pointHoverRadius:7,fill:true,tension:.4}]},
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw}% — ${esc(history[ctx.dataIndex].name)}`}}},scales:{y:{min:0,max:100,ticks:{color:txtColor,callback:v=>v+'%'},grid:{color:gridColor}},x:{ticks:{color:txtColor},grid:{display:false}}}}
  });
}

function clearHistory(){
  if(!confirm(window.t('history.confirm')))return;
  localStorage.removeItem('mq_history');renderHistory();
}

/* PWA */
function registerSW(){
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.error));
}
let deferredPrompt=null;
function initInstallBanner(){
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();deferredPrompt=e;
    if(localStorage.getItem('mq_install_dismissed'))return;
    document.getElementById('install-banner')?.classList.remove('hidden');
  });
  document.getElementById('install-btn')?.addEventListener('click',()=>{
    document.getElementById('install-banner')?.classList.add('hidden');
    deferredPrompt?.prompt();
  });
  document.getElementById('install-dismiss')?.addEventListener('click',()=>{
    document.getElementById('install-banner')?.classList.add('hidden');
    localStorage.setItem('mq_install_dismissed','1');
  });
}

/* UTILS */
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function showToast(msg,type='success'){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const t=document.createElement('div');
  t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .4s';setTimeout(()=>t.remove(),400)},2200);
}

/* ── REDO QUIZ ─────────────────────────────────────────── */
function redoQuiz(historyIdx) {
  const history = getHistory();
  const entry   = history[historyIdx];
  if (!entry || !entry.questions || !entry.questions.length) {
    showToast(
      window.MQ_LANG === 'pt'
        ? 'Questoes nao encontradas. Salve o quiz novamente.'
        : 'Questions not found. Please save the quiz again.',
      'error'
    );
    return;
  }
  State.questions = entry.questions;
  State.current   = 0;
  State.score     = 0;
  State.answers   = [];
  showScreen('screen-quiz');
  renderQuestion();
}

// Delegated click handler for dynamically rendered redo buttons
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.redo-btn');
  if (!btn) return;
  var idx = parseInt(btn.dataset.idx, 10);
  redoQuiz(idx);
});
