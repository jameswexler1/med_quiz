'use strict';
const State={questions:[],current:0,score:0,answers:[]};
let chartFinal=null,chartHistory=null;

document.addEventListener('DOMContentLoaded',()=>{
  initTheme();
  registerSW();
  initInstallBanner();
  bindEvents();
  // Check for shared quiz link
  const _shareId = new URLSearchParams(window.location.search).get('share');
  if(_shareId){
    handleSharedLink(_shareId);
  } else if(document.getElementById('screen-home')){
    showScreen('screen-home');
    checkResumeBanner();
  }
});

function bindEvents(){
  document.getElementById('theme-toggle')?.addEventListener('click',toggleTheme);
  document.querySelectorAll('.lang-btn').forEach(b=>b.addEventListener('click',()=>window.setLang(b.dataset.lang)));
  document.getElementById('load-btn')?.addEventListener('click',loadQuiz);
  document.getElementById('history-btn')?.addEventListener('click',()=>showScreen('screen-history'));
  document.getElementById('file-trigger')?.addEventListener('click',()=>document.getElementById('file-input')?.click());
  document.getElementById('file-input')?.addEventListener('change',handleFileUpload);
  document.getElementById('quiz-back')?.addEventListener('click',()=>{if(confirm(window.t('quiz.exitMsg'))){clearSession();showScreen('screen-home')}});
  document.getElementById('next-btn')?.addEventListener('click',nextQuestion);
  document.getElementById('prev-btn')?.addEventListener('click',prevQuestion);
  document.getElementById('next-arrow-btn')?.addEventListener('click',nextQuestionArrow);
  document.getElementById('save-btn')?.addEventListener('click',()=>saveResult());
  document.getElementById('final-new-btn')?.addEventListener('click',()=>showScreen('screen-home'));
  document.getElementById('share-btn')?.addEventListener('click',openShareModal);
  document.getElementById('share-backdrop')?.addEventListener('click',closeShareModal);
  document.getElementById('share-close-btn')?.addEventListener('click',closeShareModal);
  document.getElementById('share-generate-btn')?.addEventListener('click',generateShareLink);
  document.getElementById('share-copy-btn')?.addEventListener('click',copyShareLink);
  document.getElementById('history-back')?.addEventListener('click',()=>showScreen('screen-home'));
  document.getElementById('clear-btn')?.addEventListener('click',clearHistory);
  document.getElementById('json-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))loadQuiz()});
  document.getElementById('text-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))loadFromText()});
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
  el.classList.add('active'); if(id==='screen-home'){
    const ta=document.getElementById('json-input'); if(ta)ta.value='';
    checkResumeBanner();
  }
  window.scrollTo({top:0,behavior:'smooth'});
  if(id==='screen-history'){
    if(typeof Sync!=='undefined'&&Sync.isLoggedIn()){
      // Pull history AND session in parallel
      Promise.all([
        Sync.pull().catch(()=>{}),
        typeof pullSession==='function' ? pullSession().then(function(remote){
          if(!remote) return;
          // Only update local session if NOT currently in an active quiz
          var quizActive = document.getElementById('screen-quiz') &&
            document.getElementById('screen-quiz').classList.contains('active');
          if (!quizActive) {
            localStorage.setItem('mq_session', JSON.stringify(remote));
          }
        }).catch(function(){}) : Promise.resolve()
      ]).then(()=>renderHistory()).catch(()=>renderHistory());
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
function shuffleArray(a){
  a=a.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function loadQuiz(){
  const raw=(document.getElementById('json-input')?.value||'').trim();
  if(!raw){showToast(window.t('home.emptyErr'),'error');return}
  let data;
  // Auto-detect: try JSON first, fall back to simple text parser
  const looksLikeJson = raw.trimStart().startsWith('[') || raw.trimStart().startsWith('{');
  if(looksLikeJson){
    try{data=JSON.parse(raw)}catch(e){
      // Might be text that starts with [ — try text parser
      data=parseSimpleText(raw);
      if(!data.length){showToast(window.t('home.jsonErr'),'error');return}
    }
    if(!Array.isArray(data)||!data.length||!data[0].title||!Array.isArray(data[0].choices)||data[0].correctIndex===undefined){
      showToast(window.t('home.jsonErr'),'error');return
    }
  } else {
    data=parseSimpleText(raw);
    if(!data.length){showToast(window.t('home.textErrQ'),'error');return}
  }
  State.original=data;
  State.questions=shuffleArray(data).map(q=>{
    const correct=q.choices[q.correctIndex];
    const choices=shuffleArray(q.choices);
    return {...q,choices,correctIndex:choices.indexOf(correct)};
  });State.current=0;State.score=0;State.answers=[];
  document.getElementById('resume-banner')?.classList.add('hidden');
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
    var choiceText = choice.replace(/^[A-Ea-e][.)\]\s]+/, '').trim();
    btn.innerHTML=`<span class="choice-letter">${letters[i]||i+1}</span><span>${esc(choiceText)}</span>`;
    btn.addEventListener('click',()=>handleAnswer(i));
    container.appendChild(btn);
  });
  const fb2=document.getElementById('feedback-card');
  const nb=document.getElementById('next-btn');
  // If this question was already answered, restore its state
  const ans=State.answers[State.current];
  if(ans!==undefined){
    // Restore choice highlighting
    document.querySelectorAll('.choice-btn').forEach((btn,i)=>{
      btn.disabled=true;
      if(i===State.questions[State.current].correctIndex)btn.classList.add('correct');
      if(i===ans.idx&&!ans.correct)btn.classList.add('incorrect');
    });
    // Restore feedback
    var letters2=['A','B','C','D','E'];
    var correctLetter2=letters2[State.questions[State.current].correctIndex]||'';
    var isEn2=window.MQ_LANG==='en';
    var prefix2=isEn2?'\u2713 Correct answer: '+correctLetter2+'\n\n':'\u2713 Resposta correta: '+correctLetter2+'\n\n';
    fb2.className='card feedback-card '+(ans.correct?'correct-fb':'incorrect-fb');
    var st2=fb2.querySelector('.feedback-status');
    st2.className='feedback-status '+(ans.correct?'correct-status':'incorrect-status');
    st2.innerHTML=ans.correct
      ?'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>'+window.t('quiz.correct')
      :'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'+window.t('quiz.wrong');
    fb2.querySelector('.feedback-text').textContent=prefix2+(State.questions[State.current].explanation||'');
    fb2.classList.remove('hidden');
    nb.classList.remove('hidden');
    nb.querySelector('[data-i18n]').textContent=n===total?window.t('quiz.finish'):window.t('quiz.next');
  } else {
    fb2.className='card feedback-card hidden';
    nb.classList.add('hidden');
    nb.querySelector('[data-i18n]').textContent=n===total?window.t('quiz.finish'):window.t('quiz.next');
  }
  updateNavArrows();
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
  var letters=['A','B','C','D','E'];
  var correctLetter = letters[q.correctIndex] || '';
  var isEn = window.MQ_LANG === 'en';
  var prefix = isEn
    ? '✓ Correct answer: ' + correctLetter + '\n\n'
    : '✓ Resposta correta: ' + correctLetter + '\n\n';
  fb.querySelector('.feedback-text').textContent = prefix + (q.explanation||'');
  fb.classList.remove('hidden');
  document.getElementById('next-btn').classList.remove('hidden');
  updateNavArrows();
  saveSession();
}

function nextQuestion(){
  State.current++;
  if(State.current<State.questions.length){renderQuestion();window.scrollTo({top:0,behavior:'smooth'})}
  else showFinal();
}

/* FINAL */
function showFinal(){clearSession();
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
  document.getElementById('quiz-name-input').value = State.quizName || '';
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
  const questions=State.original||State.questions;
  const total=questions.length;
  const percent=Math.round((State.score/total)*100);
  const date=new Date().toLocaleString(locale);
  if(State.redoId){
    const idx=history.findIndex(h=>h.id===State.redoId);
    if(idx>=0){
      history[idx]={...history[idx],score:State.score,total,percent,date};
    }
    State.redoId=null;State.redoName=null;
  } else {
    history.push({id:Date.now(),name,date,score:State.score,total,percent,questions});
  }
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

  // Show all paused sessions at top
  var activeSessions = typeof getSessions === 'function' ? getSessions().filter(function(s){
    return s.savedAt && (Date.now() - s.savedAt < 7*24*60*60*1000) && s.sessionId;
  }) : [];
  activeSessions.forEach(function(session, si) {
    var isEn  = window.MQ_LANG === 'en';
    var done  = session.current || 0;
    var total = (session.shuffled || []).length;
    var pct   = total ? Math.round((done/total)*100) : 0;
    var name  = session.quizName || (isEn ? 'Quiz '+(si+1) : 'Simulado '+(si+1));
    var inProg = document.createElement('div');
    inProg.className = 'history-item session-in-progress';
    inProg.style.animationDelay = (si*45)+'ms';
    inProg.innerHTML =
      '<div class="history-item-info">' +
        '<div class="history-item-name"><span class="session-badge">⏸ ' + esc(name) + '</span></div>' +
        '<div class="history-item-date">' +
          (isEn ? 'Q '+(done+1)+' of '+total : 'Q '+(done+1)+' de '+total) +
          ' · ' + pct + '%' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button class="btn btn-primary btn-sm sess-res">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg>' +
          (isEn?'Resume':'Continuar') +
        '</button>' +
        '<button class="btn btn-ghost btn-sm sess-dis" style="color:var(--text-3);padding:7px 10px">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>';
    inProg.querySelector('.sess-res').addEventListener('click', function(){ resumeSession(session); });
    inProg.querySelector('.sess-dis').addEventListener('click', function(){
      removeSession(session.sessionId); renderHistory(); checkResumeBanner();
    });
    list.appendChild(inProg);
  });
  if(!history.length && !activeSessions.length){
    list.innerHTML += '<div class="history-empty">' + window.t('history.empty') + '</div>';
    if(chartHistory){chartHistory.destroy();chartHistory=null}
    document.getElementById('history-chart-wrap')?.classList.add('hidden');return;
  }
  if(!history.length){
    if(chartHistory){chartHistory.destroy();chartHistory=null}
    document.getElementById('history-chart-wrap')?.classList.add('hidden');return;
  }
  document.getElementById('history-chart-wrap')?.classList.remove('hidden');
  [...history].reverse().forEach((h,i)=>{
    const item=document.createElement('div');
    item.className='history-item';item.style.animationDelay=(i*45)+'ms';
    const pc=h.percent>=70?'var(--green)':h.percent>=50?'var(--yellow)':'var(--red)';
    item.innerHTML=`<div class="history-item-info"><div class="history-item-name">${esc(h.name)}</div><div class="history-item-date">${h.date}</div></div><div class="history-item-score"><div class="history-score-num" style="color:${pc}">${h.score}/${h.total}</div><div class="history-score-pct">${h.percent}%</div></div><button class="btn btn-secondary btn-sm history-menu-btn" data-idx="${history.length-1-i}" data-has-questions="${h.questions?'1':'0'}" style="margin-left:8px;flex-shrink:0;padding:7px 12px;font-size:1.1rem;line-height:1;letter-spacing:.1em">···</button>`;
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
    // Don't show if already installed
    if(window.matchMedia('(display-mode: standalone)').matches) return;
    // Don't show if dismissed within the last 2 days
    const dismissed = localStorage.getItem('mq_install_dismissed');
    if(dismissed && Date.now() - parseInt(dismissed) < 2*24*60*60*1000) return;
    document.getElementById('install-banner')?.classList.remove('hidden');
  });
  document.getElementById('install-btn')?.addEventListener('click',()=>{
    document.getElementById('install-banner')?.classList.add('hidden');
    deferredPrompt?.prompt();
    localStorage.removeItem('mq_install_dismissed');
  });
  document.getElementById('install-dismiss')?.addEventListener('click',()=>{
    document.getElementById('install-banner')?.classList.add('hidden');
    // Store timestamp instead of '1' so it resets after 2 days
    localStorage.setItem('mq_install_dismissed', Date.now().toString());
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
  State.quizName  = entry.name || (window.MQ_LANG === 'en' ? 'Quiz' : 'Simulado');
  State.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  State.original=entry.questions;
  State.questions=shuffleArray(entry.questions).map(q=>{
    const correct=q.choices[q.correctIndex];
    const choices=shuffleArray(q.choices);
    return {...q,choices,correctIndex:choices.indexOf(correct)};
  });
  State.current     = 0;
  State.score       = 0;
  State.answers     = [];
  State.redoId      = entry.id;
  State.redoName    = entry.name;
  showScreen('screen-quiz');
  renderQuestion();
}

// Delegated click handler for history item menus
document.addEventListener('click', function(e) {
  const menuBtn = e.target.closest('.history-menu-btn');
  if (menuBtn) {
    e.stopPropagation();
    openHistoryMenu(menuBtn);
    return;
  }
  // Click outside closes menu
  closeHistoryMenu();

  // These still work via the floating menu buttons
  const ren = e.target.closest('.rename-btn');
  if (ren) { closeHistoryMenu(); renameHistoryItem(parseInt(ren.dataset.idx,10)); return; }
  const redo = e.target.closest('.redo-btn');
  if (redo) { closeHistoryMenu(); redoQuiz(parseInt(redo.dataset.idx,10)); return; }
  const share = e.target.closest('.share-history-btn');
  if (share) { closeHistoryMenu(); shareFromHistory(parseInt(share.dataset.idx,10)); return; }
  const del = e.target.closest('.delete-btn');
  if (del) { closeHistoryMenu(); deleteHistoryItem(parseInt(del.dataset.idx,10)); }
});

/* ── SESSION PERSISTENCE ───────────────────────────────── */
function saveSession() {
  const session = {
    questions:  State.original || State.questions,
    shuffled:   State.questions,
    current:    State.current,
    score:      State.score,
    answers:    State.answers,
    redoId:     State.redoId    || null,
    redoName:   State.redoName  || null,
    quizName:   State.quizName  || '',
    sessionId:  State.sessionId || '',
    savedAt:    Date.now(),
  };
  localStorage.setItem('mq_session', JSON.stringify(session));
  if (typeof upsertSession === 'function') upsertSession(session);
  if (typeof pushSession === 'function') pushSession(session).catch(console.warn);
}

function clearSession() {
  localStorage.removeItem('mq_session');
  if (State.sessionId && typeof removeSession === 'function') {
    removeSession(State.sessionId);
  }
  State.sessionId = null;
  if (typeof clearRemoteSession === 'function') {
    clearRemoteSession();
  }
}

function loadSession() {
  try {
    const s = localStorage.getItem('mq_session');
    return s ? JSON.parse(s) : null;
  } catch(e) { return null; }
}

function resumeSession(session) {
  State.original  = session.questions;
  State.questions = session.shuffled;
  State.current   = session.current;
  State.score     = session.score;
  State.answers   = session.answers || [];
  State.redoId    = session.redoId   || null;
  State.redoName  = session.redoName  || null;
  State.quizName  = session.quizName  || '';
  State.sessionId = session.sessionId || '';
  showScreen('screen-quiz');
  renderQuestion();
  updateNavArrows();
}

function getSessions() {
  try { return JSON.parse(localStorage.getItem('mq_sessions') || '[]'); } catch(e) { return []; }
}
function saveSessions(sessions) {
  localStorage.setItem('mq_sessions', JSON.stringify(sessions));
}
function upsertSession(session) {
  if (!session || !session.sessionId) return;
  var sessions = getSessions();
  var idx = sessions.findIndex(function(s){ return s.sessionId === session.sessionId; });
  if (idx >= 0) sessions[idx] = session;
  else sessions.unshift(session);
  if (sessions.length > 5) sessions = sessions.slice(0, 5);
  saveSessions(sessions);
}
function removeSession(sessionId) {
  saveSessions(getSessions().filter(function(s){ return s.sessionId !== sessionId; }));
}

function checkResumeBanner() {
  var banner = document.getElementById('resume-banner');
  if (!banner) return;
  var quizActive  = document.getElementById('screen-quiz') && document.getElementById('screen-quiz').classList.contains('active');
  var finalActive = document.getElementById('screen-final') && document.getElementById('screen-final').classList.contains('active');
  if (quizActive || finalActive) { banner.classList.add('hidden'); return; }

  var sessions = getSessions().filter(function(s){
    return s.savedAt && (Date.now() - s.savedAt < 7*24*60*60*1000);
  });
  saveSessions(sessions);
  if (!sessions.length) { banner.classList.add('hidden'); return; }

  var isEn  = window.MQ_LANG === 'en';
  var count = document.getElementById('resume-count');
  var track = document.getElementById('resume-carousel-track');
  var title = document.getElementById('resume-title');
  if (count) count.textContent = sessions.length;
  if (title) title.textContent = isEn ? 'Continue' : 'Continuar';

  if (track) {
    var dots = document.getElementById('resume-dots');
  track.innerHTML = '';
  if (dots) dots.innerHTML = '';
  sessions.forEach(function(session, idx) {
    var done  = session.current || 0;
    var total = (session.shuffled || []).length;
    var pct   = total ? Math.round((done/total)*100) : 0;
    var name  = session.quizName || (isEn ? 'Quiz' : 'Simulado');
    var card  = document.createElement('div');
    card.className = 'resume-card';
    card.innerHTML =
      '<div class="resume-card-name">' + esc(name) + '</div>' +
      '<div class="resume-card-meta">' +
        (isEn ? 'Q '+(done+1)+' of '+total : 'Q '+(done+1)+' de '+total) +
        ' · ' + session.score + (isEn ? ' correct' : ' acerto(s)') +
      '</div>' +
      '<div class="resume-card-progress">' +
        '<div class="resume-card-progress-fill" style="width:'+pct+'%"></div>' +
      '</div>' +
      '<div class="resume-card-actions">' +
        '<button class="btn btn-primary btn-sm" style="flex:1">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg>' +
          (isEn ? 'Resume' : 'Continuar') +
        '</button>' +
        '<button class="btn btn-ghost btn-sm" style="color:var(--text-3);padding:7px 10px" title="'+(isEn?'Discard':'Descartar')+'">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>';
    card.querySelectorAll('.btn')[0].addEventListener('click', function(){ resumeSession(session); });
    card.querySelectorAll('.btn')[1].addEventListener('click', function(){
      removeSession(session.sessionId); checkResumeBanner();
    });
    track.appendChild(card);
    if (dots && sessions.length > 1) {
      var dot = document.createElement('button');
      dot.className = 'resume-dot' + (idx === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Session ' + (idx+1));
      (function(i) {
        dot.addEventListener('click', function() {
          track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
        });
      })(idx);
      dots.appendChild(dot);
    }
  });
  if (sessions.length > 1) {
    track.addEventListener('scroll', function() {
      var i = Math.round(track.scrollLeft / track.clientWidth);
      if (dots) dots.querySelectorAll('.resume-dot').forEach(function(d, j) {
        d.classList.toggle('active', j === i);
      });
    }, { passive: true });
  }
  banner.classList.remove('hidden');
}
}

function openShareModal() {
  const isEn = window.MQ_LANG === 'en';
  document.getElementById('share-modal-title').textContent =
    isEn ? 'Share Quiz' : 'Compartilhar Quiz';
  document.getElementById('share-modal-sub').textContent =
    isEn ? 'Anyone with the link can take this quiz.' : 'Qualquer pessoa com o link pode fazer este simulado.';
  document.getElementById('share-generate-label').textContent =
    isEn ? 'Generate link' : 'Gerar link';
  document.getElementById('share-copy-label').textContent =
    isEn ? 'Copy link' : 'Copiar link';
  // Reset state
  document.getElementById('share-link-wrap').classList.add('hidden');
  document.getElementById('share-generate-btn').classList.remove('hidden');
  document.getElementById('share-modal').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}

async function generateShareLink() {
  const isEn  = window.MQ_LANG === 'en';
  const btn   = document.getElementById('share-generate-btn');
  const label = document.getElementById('share-generate-label');
  const name  = (document.getElementById('quiz-name-input')?.value || '').trim()
    || (isEn ? 'Shared Quiz' : 'Quiz Compartilhado');

  btn.disabled  = true;
  label.textContent = isEn ? 'Generating…' : 'Gerando…';

  try {
    const questions = State.original || State.questions;
    const url = await window.shareQuiz(name, questions);
    document.getElementById('share-link-input').value = url;
    document.getElementById('share-link-wrap').classList.remove('hidden');
    btn.classList.add('hidden');
  } catch(e) {
    showToast(isEn ? 'Could not generate link' : 'Erro ao gerar link', 'error');
    btn.disabled = false;
    label.textContent = isEn ? 'Generate link' : 'Gerar link';
  }
}

function copyShareLink() {
  const url   = document.getElementById('share-link-input').value;
  const isEn  = window.MQ_LANG === 'en';
  const label = document.getElementById('share-copy-label');
  navigator.clipboard.writeText(url).then(() => {
    label.textContent = '✓ ' + (isEn ? 'Copied!' : 'Copiado!');
    setTimeout(() => {
      label.textContent = isEn ? 'Copy link' : 'Copiar link';
    }, 2000);
  }).catch(() => {
    document.getElementById('share-link-input').select();
    document.execCommand('copy');
    label.textContent = '✓';
    setTimeout(() => { label.textContent = isEn ? 'Copy link' : 'Copiar link'; }, 2000);
  });
}

async function handleSharedLink(id) {
  const isEn = window.MQ_LANG === 'en';
  // Show home screen with loading state
  if(document.getElementById('screen-home')) showScreen('screen-home');

  // Show a loading toast
  showToast(isEn ? 'Loading shared quiz…' : 'Carregando simulado…', 'success');

  try {
    const quiz = await window.loadSharedQuiz(id);
    // Pre-fill the name input and textarea, then auto-load
    const nameInput = document.getElementById('quiz-name-input');
    if(nameInput) nameInput.value = quiz.name;
    // Load directly
    State.original  = quiz.questions;
    State.questions = (function(a){
      a=a.slice();
      for(let i=a.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [a[i],a[j]]=[a[j],a[i]];
      }
      return a;
    })(quiz.questions).map(q=>{
      const correct=q.choices[q.correctIndex];
      const choices=(function(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;})(q.choices);
      return {...q,choices,correctIndex:choices.indexOf(correct)};
    });
    State.current  = 0;
    State.score    = 0;
    State.answers  = [];
    State.redoId   = null;
    State.redoName = null;
    // Clean URL without reloading
    window.history.replaceState({}, '', '/');
    showScreen('screen-quiz');
    renderQuestion();
  } catch(e) {
    showToast(isEn ? 'Shared quiz not found' : 'Simulado não encontrado', 'error');
    if(document.getElementById('screen-home')) showScreen('screen-home');
  }
}

async function shareFromHistory(historyIdx) {
  const history = getHistory();
  const entry   = history[historyIdx];
  if (!entry || !entry.questions || !entry.questions.length) {
    showToast(
      window.MQ_LANG === 'pt'
        ? 'Questões não encontradas neste item.'
        : 'No questions found for this entry.',
      'error'
    );
    return;
  }

  const isEn = window.MQ_LANG === 'en';

  // Reuse the share modal but pre-generate the link immediately
  document.getElementById('share-modal-title').textContent =
    isEn ? 'Share Quiz' : 'Compartilhar Quiz';
  document.getElementById('share-modal-sub').textContent =
    isEn ? 'Generating link…' : 'Gerando link…';
  document.getElementById('share-link-wrap').classList.add('hidden');
  document.getElementById('share-generate-btn').classList.add('hidden');
  document.getElementById('share-modal').classList.remove('hidden');

  try {
    const url = await window.shareQuiz(entry.name, entry.questions);
    document.getElementById('share-modal-sub').textContent =
      isEn ? 'Anyone with the link can take this quiz.' : 'Qualquer pessoa com o link pode fazer este simulado.';
    document.getElementById('share-link-input').value = url;
    document.getElementById('share-link-wrap').classList.remove('hidden');
    const copyLabel = document.getElementById('share-copy-label');
    copyLabel.textContent = isEn ? 'Copy link' : 'Copiar link';
  } catch(e) {
    closeShareModal();
    showToast(isEn ? 'Could not generate link' : 'Erro ao gerar link', 'error');
  }
}

async function deleteHistoryItem(historyIdx) {
  const isEn   = window.MQ_LANG === 'en';
  const history = getHistory();
  const entry  = history[historyIdx];
  if (!entry) return;

  const msg = isEn
    ? 'Delete "' + entry.name + '"? This cannot be undone.'
    : 'Excluir "' + entry.name + '"? Esta ação não pode ser desfeita.';
  if (!confirm(msg)) return;

  // Remove from local
  history.splice(historyIdx, 1);
  localStorage.setItem('mq_history', JSON.stringify(history));

  // Push updated history to Supabase
  if (typeof Sync !== 'undefined' && Sync.isLoggedIn()) {
    Sync.push().catch(console.warn);
  }

  renderHistory();
  showToast(isEn ? 'Deleted' : 'Excluído', 'success');
}

/* ── FLOATING HISTORY MENU ──────────────────────────────── */
let _histMenuEl = null;

function closeHistoryMenu() {
  if (_histMenuEl) { _histMenuEl.remove(); _histMenuEl = null; }
}

function openHistoryMenu(btn) {
  closeHistoryMenu();
  const idx         = btn.dataset.idx;
  const hasQuestions = btn.dataset.hasQuestions === '1';
  const isEn        = window.MQ_LANG === 'en';

  const menu = document.createElement('div');
  menu.className = 'history-menu-dropdown';
  menu.innerHTML =
    (hasQuestions ? `<button class="history-menu-item redo-btn" data-idx="${idx}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.98"/></svg>
      <span>${isEn?'Redo':'Refazer'}</span></button>` : '') +
    (hasQuestions ? `<button class="history-menu-item share-history-btn" data-idx="${idx}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      <span>${isEn?'Share':'Compartilhar'}</span></button>` : '') +
    `<button class="history-menu-item rename-btn" data-idx="${idx}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
      <span>${isEn?'Rename':'Renomear'}</span></button>` +
    `<button class="history-menu-item delete-btn" data-idx="${idx}" style="color:var(--red)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6m4-6v6"/><path d="M9,6V4h6v2"/></svg>
      <span>${isEn?'Delete':'Excluir'}</span></button>`;
  document.body.appendChild(menu);
  const rect  = btn.getBoundingClientRect();
  const menuH = menu.offsetHeight || 160;
  const menuW = menu.offsetWidth  || 160;
  const top   = (window.innerHeight - rect.bottom > menuH)
    ? rect.bottom + window.scrollY + 4
    : rect.top    + window.scrollY - menuH - 4;
  const left  = Math.min(rect.right - menuW, window.innerWidth - menuW - 8);
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';
  _histMenuEl = menu;
}

/* ── INPUT TAB SWITCHER ─────────────────────────────────── */
function switchInputTab(mode) {
  var isJson = mode === 'json';
  document.getElementById('panel-json').style.display = isJson ? '' : 'none';
  document.getElementById('panel-text').style.display = isJson ? 'none' : '';
  document.getElementById('tab-json').classList.toggle('active', isJson);
  document.getElementById('tab-text').classList.toggle('active', !isJson);
}

/* ── SIMPLE TEXT PARSER ─────────────────────────────────── */
function parseSimpleText(raw) {
  var isEn = window.MQ_LANG === 'en';
  var lines = raw.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
  var questions = [];
  var current = null;
  var inExplain = false;
  var explainLines = [];

  function commitQuestion() {
    if (!current) return;
    if (current.choices.length && current.correctIdx >= 0) {
      current.obj.explanation = explainLines.join(' ').trim();
      questions.push(current.obj);
    }
    current = null;
    inExplain = false;
    explainLines = [];
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    // New question: starts with a number followed by . or )
    if (/^\d+[.)]\s/.test(line)) {
      commitQuestion();
      inExplain = false;
      explainLines = [];
      current = {
        choices: [],
        correctIdx: -1,
        obj: {
          title: line.replace(/^\d+[.)]\s*/, '').trim(),
          choices: [],
          correctIndex: -1,
          explanation: ''
        }
      };
      continue;
    }

    if (!current) continue;

    // Choice line: A. B. C. D. E. or A) B) etc
    if (/^[A-Ea-e][.)]\s/.test(line)) {
      inExplain = false;
      var letter = line[0].toUpperCase();
      var text   = line.slice(2).trim();
      current.choices.push(letter + ') ' + text);
      current.obj.choices = current.choices;
      continue;
    }

    // Correct answer
    var isCorrect = isEn ? /^correct:/i.test(line) : /^correta?:/i.test(line);
    if (isCorrect) {
      inExplain = false;
      var val = line.replace(/^[^:]+:\s*/, '').trim().toUpperCase().replace(/[.)]/g, '');
      current.correctIdx = ['A','B','C','D','E'].indexOf(val);
      current.obj.correctIndex = current.correctIdx;
      continue;
    }

    // Explanation
    var isExplain = isEn ? /^explanation:/i.test(line) : /^explic/i.test(line);
    if (isExplain) {
      inExplain = true;
      var rest = line.replace(/^[^:]+:\s*/, '').trim();
      if (rest) explainLines.push(rest);
      continue;
    }

    if (inExplain) {
      explainLines.push(line);
    }
  }

  commitQuestion();
  return questions;
}

function loadFromText() {
  var raw = (document.getElementById('text-input') ? document.getElementById('text-input').value : '').trim();
  if (!raw) { showToast(window.t('home.emptyErr'), 'error'); return; }
  var data;
  try { data = parseSimpleText(raw); } catch(e) { showToast(window.t('home.textErr'), 'error'); return; }
  if (!data.length) { showToast(window.t('home.textErrQ'), 'error'); return; }
  var preName  = (document.getElementById('quiz-name-pre') ? document.getElementById('quiz-name-pre').value : '').trim();
  var locale2  = window.MQ_LANG === 'pt' ? 'pt-BR' : 'en-US';
  State.quizName  = preName || (window.MQ_LANG === 'en' ? 'Quiz ' : 'Simulado ') + new Date().toLocaleDateString(locale2);
  State.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  State.original  = data;
  State.questions = shuffleArray(data).map(function(q) {
    var correct  = q.choices[q.correctIndex];
    var choices  = shuffleArray(q.choices);
    return Object.assign({}, q, {choices: choices, correctIndex: choices.indexOf(correct)});
  });
  State.current  = 0;
  State.score    = 0;
  State.answers  = [];
  State.redoId   = null;
  State.redoName = null;
  var rb = document.getElementById('resume-banner');
  if (rb) rb.classList.add('hidden');
  showScreen('screen-quiz');
  renderQuestion();
}


async function renameHistoryItem(historyIdx) {
  var isEn    = window.MQ_LANG === 'en';
  var history = getHistory();
  var entry   = history[historyIdx];
  if (!entry) return;
  var msg = isEn ? 'New name:' : 'Novo nome:';
  var newName = prompt(msg, entry.name);
  if (newName === null) return;
  newName = newName.trim();
  if (!newName) return;
  history[historyIdx].name = newName;
  localStorage.setItem('mq_history', JSON.stringify(history));
  if (typeof Sync !== 'undefined' && Sync.isLoggedIn()) {
    Sync.push().catch(console.warn);
  }
  renderHistory();
  showToast(isEn ? 'Renamed' : 'Renomeado', 'success');
}

/* ── QUESTION NAVIGATION ────────────────────────────────── */
function updateNavArrows() {
  var prev = document.getElementById('prev-btn');
  var next = document.getElementById('next-arrow-btn');
  if (!prev || !next) return;
  // Prev: enabled if not on first question
  prev.disabled = State.current === 0;
  // Next arrow: enabled if current question answered AND not on last question
  var answered = State.answers[State.current] !== undefined;
  var isLast   = State.current === State.questions.length - 1;
  next.disabled = !answered || isLast;
}

function prevQuestion() {
  if (State.current === 0) return;
  State.current--;
  renderQuestion();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function nextQuestionArrow() {
  // Only allowed if current question is answered
  if (State.answers[State.current] === undefined) return;
  if (State.current >= State.questions.length - 1) return;
  State.current++;
  renderQuestion();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

/* ── SYNC SESSION ON PAGE HIDE ──────────────────────────── */
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    var session = loadSession();
    if (!session || typeof SUPA_URL === 'undefined') return;
    // Use sendBeacon for guaranteed delivery on page hide
    var url = SUPA_URL + '/rest/v1/sessions';
    var payload = JSON.stringify({
      username:   typeof Sync !== 'undefined' && Sync.username ? Sync.username : null,
      session:    session,
      updated_at: new Date().toISOString(),
    });
    if (typeof Sync !== 'undefined' && Sync.isLoggedIn() && navigator.sendBeacon) {
      var blob = new Blob([payload], {type: 'application/json'});
      navigator.sendBeacon(url, blob);
    }
  }
});