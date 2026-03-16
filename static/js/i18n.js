'use strict';
window.MQ_TR={
  pt:{
    'nav.history':'Histórico','nav.prompt':'Prompt IA',
    'home.tagline':'Simulados para Residência Médica',
    'home.pasteLabel':'Cole o JSON das questões',
    'home.placeholder':'[{"title":"Pergunta...","choices":["A) ...","B) ..."],"correctIndex":0,"explanation":"..."}]',
    'home.loadBtn':'Iniciar Simulado','home.orUpload':'ou carregar arquivo',
    'home.historyBtn':'Ver Histórico',
    'home.emptyErr':'Cole o JSON antes de iniciar.',
    'home.jsonErr':'JSON inválido. Verifique o formato.',
    'quiz.question':'Questão','quiz.of':'de','quiz.expLabel':'Explicação',
    'quiz.correct':'Correto!','quiz.wrong':'Incorreto',
    'quiz.next':'Próxima','quiz.finish':'Ver Resultado',
    'quiz.exitMsg':'Sair do simulado? O progresso será perdido.',
    'final.title':'Simulado Concluído!',
    'final.placeholder':'Nome do simulado (ex: Cardiologia — USP)',
    'final.saveBtn':'Salvar Resultado','final.newQuiz':'Novo Simulado',
    'final.saveOk':'Resultado salvo!',
    'final.excellent':'Excelente!','final.good':'Muito Bom!',
    'final.average':'Bom!','final.poor':'Continue Praticando!',
    'history.title':'Histórico','history.empty':'Nenhum simulado salvo ainda.',
    'history.clear':'Limpar','history.confirm':'Limpar todo o histórico? Esta ação não pode ser desfeita.',
    'history.back':'Voltar',
    'prompt.subtitle':'Copie e use com ChatGPT, Claude, OpenEvidence ou qualquer IA',
    'prompt.copy':'Copiar','prompt.copied':'✓ Copiado!',
    'prompt.format':'Formato JSON esperado',
    'install.title':'Instalar MedQuiz','install.sub':'Adicionar à tela inicial','install.btn':'Instalar',
  },
  en:{
    'nav.history':'History','nav.prompt':'AI Prompt',
    'home.tagline':'Medical Residency Exam Prep',
    'home.pasteLabel':'Paste your questions JSON',
    'home.placeholder':'[{"title":"Question...","choices":["A) ...","B) ..."],"correctIndex":0,"explanation":"..."}]',
    'home.loadBtn':'Start Quiz','home.orUpload':'or upload file',
    'home.historyBtn':'View History',
    'home.emptyErr':'Please paste the JSON before starting.',
    'home.jsonErr':'Invalid JSON. Check the format.',
    'quiz.question':'Question','quiz.of':'of','quiz.expLabel':'Explanation',
    'quiz.correct':'Correct!','quiz.wrong':'Incorrect',
    'quiz.next':'Next','quiz.finish':'See Results',
    'quiz.exitMsg':'Exit the quiz? Progress will be lost.',
    'final.title':'Quiz Complete!',
    'final.placeholder':'Quiz name (e.g., Cardiology — USP)',
    'final.saveBtn':'Save Result','final.newQuiz':'New Quiz',
    'final.saveOk':'Result saved!',
    'final.excellent':'Excellent!','final.good':'Very Good!',
    'final.average':'Good!','final.poor':'Keep Practicing!',
    'history.title':'History','history.empty':'No saved quizzes yet.',
    'history.clear':'Clear','history.confirm':'Clear all history? This cannot be undone.',
    'history.back':'Back',
    'prompt.subtitle':'Copy and use with ChatGPT, Claude, OpenEvidence or any AI',
    'prompt.copy':'Copy','prompt.copied':'✓ Copied!',
    'prompt.format':'Expected JSON format',
    'install.title':'Install MedQuiz','install.sub':'Add to Home Screen','install.btn':'Install',
  }
};
window.MQ_LANG=localStorage.getItem('mq_lang')||'pt';
window.t=k=>window.MQ_TR[window.MQ_LANG]?.[k]??k;
window.setLang=function(lang){
  window.MQ_LANG=lang;
  localStorage.setItem('mq_lang',lang);
  document.documentElement.setAttribute('data-lang',lang);
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k=el.getAttribute('data-i18n');
    if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')el.placeholder=window.t(k);
    else el.textContent=window.t(k);
  });
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));
};
document.addEventListener('DOMContentLoaded',()=>window.setLang(window.MQ_LANG));
