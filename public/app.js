/* UI — Validação de Soluções. Depende de filtros.js (FILTERS, LEVELS) e data.js (SOLUCOES). */
(function(){
var LOGO='logo.png';

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function sameSet(a,b){return a.length===b.length&&a.every(function(x){return b.indexOf(x)!==-1;});}
function ordered(f,list){var inOpts=f.options.filter(function(o){return list.indexOf(o)!==-1;});var extra=list.filter(function(o){return f.options.indexOf(o)===-1;});return extra.concat(inOpts);}
function initialSel(sol){var s={};FILTERS.forEach(function(f){s[f.key]=sol.initial[f.key].slice();});return s;}
function freshCard(sol){return {decision:null,sel:initialSel(sol),comment:''};}

var cards=SOLUCOES.map(freshCard);
var idx=0; // SOLUCOES.length = tela final
var hover=null, saving=false, saveError='', animating=false;
var API='/api/avaliacoes', GESTOR_KEY='validacao-gestor';
var gestor=null, online=false, fila=Promise.resolve(); // fila: grava uma avaliação por vez
var sheetEl=document.getElementById('sheet');
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cur(){return cards[idx];}
function sol(){return SOLUCOES[idx];}
function changed(i){var c=cards[i],s=SOLUCOES[i];return FILTERS.filter(function(f){return !sameSet(c.sel[f.key]||[],s.initial[f.key]);});}
function avaliadas(){return cards.filter(function(c){return c.decision==='aprovada'||c.decision==='reclassificada';}).length;}
function firstPending(){return cards.findIndex(function(c){return c.decision===null;});}
function hasEmpty(){var c=cur();return FILTERS.some(function(f){return c.sel[f.key].length===0;});}

var ICON_OK='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
var ICON_NO='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function header(){return '<header class="top"><img src="'+LOGO+'" alt="Sebrae Indústria"><div class="top-txt"><b>Ficha de validação de produto</b><span>Mapeamento de Soluções para a Indústria</span></div></header>';}

function saveNote(){
  if(saving) return '<p class="save-note">Salvando…</p>';
  if(saveError) return '<p class="warn">'+esc(saveError)+'</p>';
  if(!online) return '<p class="warn">Sem conexão com o servidor: esta avaliação não está sendo salva.</p>';
  return '';
}

function rowsHtml(){
  var c=cur(),s=sol(),editing=c.decision==='editando',h='';
  FILTERS.forEach(function(f){
    var sel=c.sel[f.key],isMat=f.key==='maturidade';
    var ch=!sameSet(sel,s.initial[f.key])&&(editing||c.decision==='reclassificada');
    var shown=c.decision==='reclassificada'?ordered(f,sel):s.initial[f.key];
    h+='<div class="row'+(editing?' edit':'')+'"><div class="row-name"><b>'+esc(f.label)+'</b>';
    if(isMat) h+='<small>Passe o mouse sobre o nível para ver a definição</small>';
    if(ch) h+='<span class="tag-changed">Alterado</span>';
    h+='</div><div class="chips" role="group" aria-label="'+esc(f.label)+'">';
    if(editing){
      f.options.forEach(function(o){h+='<button type="button" class="opt" aria-pressed="'+(sel.indexOf(o)!==-1)+'" data-toggle="'+f.key+'" data-opt="'+esc(o)+'"'+(LEVELS[o]?' data-level="'+esc(o)+'"':'')+'>'+esc(o)+'</button>';});
    }else{
      shown.forEach(function(o){
        if(isMat&&LEVELS[o]) h+='<button type="button" class="chip-level" data-level="'+esc(o)+'">'+esc(o)+'</button>';
        else h+='<span class="chip">'+esc(o)+'</span>';
      });
    }
    h+='</div>';
    if(isMat&&hover&&LEVELS[hover]){var L=LEVELS[hover];h+='<div class="tip" role="tooltip"><div class="tip-head"><b>'+esc(L.title)+'</b><span>'+esc(L.range)+'</span></div><p>'+esc(L.text)+'</p><p class="signal"><strong>Sinal prático:</strong> '+esc(L.signal)+'</p></div>';}
    h+='</div>';
  });
  return h;
}

function decisionHtml(){
  var c=cur(),d=c.decision,last=idx===SOLUCOES.length-1,h='';
  var nextLbl=last?'Concluir':'Próxima solução →';
  if(d===null){
    h='<div class="stack" style="gap:12px"><span class="label">Parecer</span><div class="decide">'+
      '<button type="button" class="btn-big btn-ok" data-act="approve">'+ICON_OK+'Aprovada</button>'+
      '<button type="button" class="btn-big btn-no" data-act="reject">'+ICON_NO+'Não aprovada</button></div>'+saveNote()+'</div>';
  }else if(d==='aprovada'){
    h='<div class="panel panel-ok"><div class="panel-row"><div><div class="panel-title">Você aprovou esta solução</div><p>Classificação mantida como está.</p></div></div>'+
      '<div class="panel-row"><button type="button" class="btn-sm" data-act="reset">Refazer avaliação</button><button type="button" class="next-btn" data-act="next">'+nextLbl+'</button></div>'+saveNote()+'</div>';
  }else if(d==='editando'){
    h='<div class="panel panel-no"><p style="font-size:16px"><strong style="color:var(--no-ink)">Não aprovada.</strong> Ajuste os filtros ao lado: a classificação atual já vem marcada, é só corrigir o que estiver errado.</p>'+
      '<div class="field"><label for="comentario">Comentário (opcional)</label><textarea id="comentario" rows="2" placeholder="Ex.: atende melhor Alimentos e Bebidas">'+esc(c.comment)+'</textarea></div></div>';
  }else{
    var chs=changed(idx);
    h='<div class="panel panel-no"><div class="panel-title">Você não aprovou · nova classificação registrada</div>';
    if(chs.length) chs.forEach(function(f){h+='<p><strong>'+esc(f.label)+':</strong> <s style="color:var(--faint)">'+esc(sol().initial[f.key].join(', '))+'</s> → '+esc(ordered(f,c.sel[f.key]).join(', '))+'</p>';});
    else h+='<p>Nenhum filtro foi alterado.</p>';
    if(c.comment.trim()) h+='<p><strong>Comentário:</strong> '+esc(c.comment)+'</p>';
    h+='<div class="panel-row"><button type="button" class="btn-sm" data-act="reset">Refazer avaliação</button><button type="button" class="next-btn" data-act="next">'+nextLbl+'</button></div>'+saveNote()+'</div>';
  }
  return h;
}

function confirmBarHtml(){
  var empty=hasEmpty();
  return '<div class="confirm-bar">'+(empty?'<p class="warn">Marque ao menos uma opção em cada filtro.</p>':'')+
    '<div class="actions"><button type="button" class="btn-ghost" data-act="cancel">Cancelar</button><button type="button" class="btn-confirm" data-act="confirm"'+(empty?' disabled':'')+'>Confirmar nova classificação</button></div>'+saveNote()+'</div>';
}

function doneHtml(){
  var n=avaliadas(),pend=n<SOLUCOES.length;
  return header()+'<div class="done"><span class="label">Fim do deck</span><h1>Você avaliou '+n+' de '+SOLUCOES.length+' soluções</h1>'+
    (pend?'<p>Ainda faltam '+(SOLUCOES.length-n)+' soluções. Suas respostas já estão salvas: dá para continuar agora ou depois.</p><div class="actions"><button type="button" class="btn-ghost" data-act="restart">Revisar desde a primeira</button><button type="button" class="next-btn" data-act="pending">Ir para a próxima pendente</button></div>'
         :'<p>Obrigado! Suas respostas ficaram registradas.</p><button type="button" class="next-btn" data-act="restart">Revisar desde a primeira</button>')+'</div>';
}

function render(){
  if(idx>=SOLUCOES.length){sheetEl.innerHTML=doneHtml();renderNav();return;}
  var s=sol(),c=cur(),editing=c.decision==='editando';
  sheetEl.innerHTML=header()+
    '<div class="body'+(editing?' editing':'')+'"><div class="col">'+
      '<div class="stack"><div style="display:flex;align-items:center;gap:12px"><span class="label">Solução</span><span class="num">Nº '+esc(s.num)+'</span></div><h1>'+esc(s.nome)+'</h1></div>'+
      '<div class="stack"><span class="label">Descrição</span><p class="desc">'+esc(s.desc)+'</p></div>'+
      '<div class="price"><span class="label">Preço</span><strong>'+esc(s.preco)+'</strong></div>'+
      '<div id="decision">'+decisionHtml()+'</div>'+
    '</div><div class="col"><section class="stack" style="gap:10px" aria-labelledby="lbl-filtros">'+
      '<div class="filters-head"><span class="label" id="lbl-filtros">Classificação nos filtros</span>'+(editing?'<span class="editing-hint">Modo de reclassificação: clique para marcar ou desmarcar</span>':'')+'</div>'+
      '<div class="rows" id="rows">'+rowsHtml()+'</div></section></div>'+
      (editing?confirmBarHtml():'')+
    '</div><footer class="foot"><span>Sebrae/PR · Mapeamento de Soluções para a Indústria</span><span>Ficha '+esc(s.num)+'</span></footer>';
  renderNav();
}
function renderRowsOnly(){var r=document.getElementById('rows');if(r)r.innerHTML=rowsHtml();}

function renderNav(){
  document.getElementById('prev').disabled=idx===0||animating;
  document.getElementById('next').disabled=idx>=SOLUCOES.length||animating;
  document.getElementById('count').textContent=idx<SOLUCOES.length?('Solução '+(idx+1)+' de '+SOLUCOES.length):'Concluído';
  var n=avaliadas();
  document.getElementById('bar-fill').style.width=(100*n/SOLUCOES.length)+'%';
  document.getElementById('done-count').textContent=n+' avaliadas';
}

function go(to,dir){
  if(animating||to<0||to>SOLUCOES.length||to===idx) return;
  hover=null;saveError='';
  var c=idx<SOLUCOES.length?cur():null;
  if(c&&c.decision==='editando'){c.decision=null;c.sel=initialSel(sol());}
  if(reduce){idx=to;render();window.scrollTo({top:0});return;}
  animating=true;renderNav();
  var outCls=dir>0?'out-left':'out-right',inCls=dir>0?'out-right':'out-left';
  sheetEl.classList.add(outCls);
  setTimeout(function(){
    idx=to;render();
    sheetEl.classList.add('no-anim');sheetEl.classList.remove(outCls);sheetEl.classList.add(inCls);
    void sheetEl.offsetWidth;
    sheetEl.classList.remove('no-anim');sheetEl.classList.remove(inCls);
    window.scrollTo({top:0,behavior:'smooth'});
    setTimeout(function(){animating=false;renderNav();},440);
  },420);
}

function post(body){
  return fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok)throw new Error(d.erro||'Erro '+r.status);return d;});});
}

var pendentes=0;
function persist(i,decisao){
  if(!online||!gestor) return;
  var s=SOLUCOES[i],c=cards[i],avaliacao=null;
  if(decisao!==null){
    var sel={};FILTERS.forEach(function(f){sel[f.key]=ordered(f,c.sel[f.key]);});
    avaliacao={decisao:decisao,nomeSolucao:s.nome,classificacao:sel,alterados:changed(i).map(function(f){return f.key;}),comentario:c.comment.trim()};
  }
  var body={nome:gestor.nome,email:gestor.email,solucao:s.id,avaliacao:avaliacao};
  pendentes++;saving=true;saveError='';if(i===idx)render();
  fila=fila.then(function(){return post(body);}).catch(function(){
    saveError='Não foi possível salvar a avaliação de "'+s.nome+'". Volte nela e responda de novo em instantes.';
  }).then(function(){
    pendentes--;saving=pendentes>0;if(!animating)render();
  });
}

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-toggle]');
  if(t){var c=cur(),k=t.getAttribute('data-toggle'),o=t.getAttribute('data-opt'),arr=c.sel[k];
    c.sel[k]=arr.indexOf(o)!==-1?arr.filter(function(x){return x!==o;}):arr.concat([o]);
    render();var again=sheetEl.querySelector('[data-toggle="'+k+'"][data-opt="'+CSS.escape(o)+'"]');if(again)again.focus();return;}
  if(e.target.closest('#prev')){go(idx-1,-1);return;}
  if(e.target.closest('#next')){go(idx+1,1);return;}
  var a=e.target.closest('[data-act]');if(!a||animating)return;
  var act=a.getAttribute('data-act'),i=idx,c=cur();
  if(act==='approve'){c.decision='aprovada';c.sel=initialSel(sol());c.comment='';hover=null;render();persist(i,'aprovada');setTimeout(function(){if(idx===i)go(i+1,1);},650);}
  else if(act==='reject'){c.decision='editando';hover=null;render();}
  else if(act==='cancel'){c.decision=null;c.sel=initialSel(sol());c.comment='';render();}
  else if(act==='confirm'){if(hasEmpty())return;c.decision='reclassificada';hover=null;render();persist(i,'nao_aprovada');setTimeout(function(){if(idx===i)go(i+1,1);},650);}
  else if(act==='reset'){cards[i]=freshCard(sol());hover=null;render();persist(i,null);}
  else if(act==='next'){go(i+1,1);}
  else if(act==='restart'){go(0,-1);}
  else if(act==='pending'){var p=firstPending();if(p>=0)go(p,-1);}
});
document.addEventListener('input',function(e){if(e.target.id==='comentario')cur().comment=e.target.value;});

function showLevel(el){var lv=el.getAttribute('data-level');if(hover===lv)return;hover=lv;var f=document.activeElement===el;renderRowsOnly();if(f){var n=sheetEl.querySelector('[data-level="'+CSS.escape(lv)+'"]');if(n)n.focus();}}
function hideLevel(){if(hover===null)return;hover=null;var tip=sheetEl.querySelector('.tip');if(tip)tip.remove();}
sheetEl.addEventListener('mouseover',function(e){var el=e.target.closest('[data-level]');if(el)showLevel(el);});
sheetEl.addEventListener('mouseout',function(e){var el=e.target.closest('[data-level]');if(el&&!(e.relatedTarget&&el.contains(e.relatedTarget)))hideLevel();});
sheetEl.addEventListener('focusin',function(e){var el=e.target.closest('[data-level]');if(el)showLevel(el);});
sheetEl.addEventListener('focusout',function(e){var el=e.target.closest('[data-level]');if(el)hideLevel();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')hideLevel();});

function readGestor(){try{var g=JSON.parse(localStorage.getItem(GESTOR_KEY));return g&&g.nome&&g.email?g:null;}catch(e){return null;}}
function saveGestor(g){try{localStorage.setItem(GESTOR_KEY,JSON.stringify(g));}catch(e){}}

function showLogin(msg){
  document.getElementById('app').hidden=true;
  document.getElementById('login').hidden=false;
  var g=readGestor();
  if(g&&!document.getElementById('login-email').value){document.getElementById('login-nome').value=g.nome;document.getElementById('login-email').value=g.email;}
  var err=document.getElementById('login-erro');err.hidden=!msg;err.textContent=msg||'';
}

document.getElementById('login-form').addEventListener('submit',function(e){
  e.preventDefault();
  var nome=document.getElementById('login-nome').value.trim(),email=document.getElementById('login-email').value.trim().toLowerCase();
  var btn=document.getElementById('login-btn');
  if(!nome){showLogin('Informe seu nome.');document.getElementById('login-nome').focus();return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showLogin('Informe um e-mail válido.');document.getElementById('login-email').focus();return;}
  btn.disabled=true;btn.textContent='Entrando…';showLogin('');
  post({acao:'entrar',nome:nome,email:email}).then(function(){
    gestor={nome:nome,email:email};saveGestor(gestor);start();
  }).catch(function(x){
    showLogin(x instanceof TypeError?'Não foi possível conectar ao servidor. Verifique a internet e tente de novo.':x.message);
  }).then(function(){btn.disabled=false;btn.textContent='Iniciar validação';});
});

document.getElementById('sair').addEventListener('click',function(){
  if(pendentes>0) return; // espera terminar de salvar
  try{localStorage.removeItem(GESTOR_KEY);}catch(e){}
  location.reload();
});

// Carrega o que este gestor já respondeu e abre na primeira solução pendente.
function start(){
  document.getElementById('login').hidden=true;
  document.getElementById('app').hidden=false;
  document.getElementById('session-nome').textContent=gestor.nome+' ('+gestor.email+')';
  cards=SOLUCOES.map(freshCard);idx=0;
  sheetEl.innerHTML=header()+'<div class="done"><p>Carregando suas avaliações…</p></div>';
  fetch(API+'?email='+encodeURIComponent(gestor.email),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(d){
    var av=d.avaliacoes||{};
    SOLUCOES.forEach(function(s,i){var m=av[s.id];if(!m)return;
      if(m.decisao==='aprovada')cards[i].decision='aprovada';
      else if(m.decisao==='nao_aprovada'){cards[i].decision='reclassificada';FILTERS.forEach(function(f){var v=m.classificacao&&m.classificacao[f.key];if(Array.isArray(v)&&v.length)cards[i].sel[f.key]=v.slice();});cards[i].comment=m.comentario||'';}
    });
    online=true;
    var p=firstPending();idx=p<0?SOLUCOES.length:p;
  }).catch(function(){online=false;}).then(render);
}

gestor=readGestor();
if(gestor) start(); else showLogin();
})();
