/* UI — Validação de Soluções. Depende de filtros.js (FILTERS, LEVELS, FILTER_TIPS, unifica) e data.js (SOLUCOES). */
(function(){
var LOGO='logo.png';

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function sameSet(a,b){return a.length===b.length&&a.every(function(x){return b.indexOf(x)!==-1;});}
function ordered(f,list){var inOpts=f.options.filter(function(o){return list.indexOf(o)!==-1;});var extra=list.filter(function(o){return f.options.indexOf(o)===-1;});return extra.concat(inOpts);}
function initialSel(sol){var s={};FILTERS.forEach(function(f){s[f.key]=sol.initial[f.key].slice();});return s;}
// ms: tempo com a ficha aberta; ns: mostrando os motivos do "Não sei"; aviso: o que falta para registrar o parecer clicado
function freshCard(sol){return {decision:null,sel:initialSel(sol),comment:'',motivo:'',ms:0,ns:false,aviso:''};}

// Pareceres. "nao_aprovada" é da 1ª rodada (antes de existir "com ajustes") e só aparece em respostas antigas.
var PARECER={aprovada:'Aprovada como está',ajustada:'Aprovada com ajustes',fora_escopo:'Fora do escopo',nao_sei:'Não sei avaliar',nao_aprovada:'Não aprovada'};
var MOTIVOS_NS=[['nao_conheco','Não conheço a solução'],['descricao','A descrição não basta para avaliar'],['industria','Não sei se é da indústria']];
function motivoTxt(m){var x=MOTIVOS_NS.filter(function(p){return p[0]===m;})[0];return x?x[1]:MOTIVOS_NS[0][1];} // respostas antigas: "Não conheço"
var DEF_VISIVEL={jornada:true,momento:true}; // filtros com a definição escrita ao lado de cada opção
// Visualização dos filtros: "completa" escreve definições e instruções na tela; "simples" deixa tudo como dica ao passar o mouse.
var MODO_KEY='validacao-modo',modo='completa';
try{if(localStorage.getItem(MODO_KEY)==='simples')modo='simples';}catch(e){}
function completa(){return modo==='completa';}
var HINT_FILTROS='A classificação atual já vem marcada. Se algo estiver errado, marque ou desmarque as opções e escolha "Aprovada com ajustes".';
function modoHtml(){
  return '<div class="modo" role="group" aria-label="Visualização dos filtros">'+
    [['completa','Completa','Mostra as definições e as instruções escritas na tela.'],['simples','Simplificada','Deixa as opções compactas; as definições aparecem ao passar o mouse.']].map(function(m){
      return '<button type="button" data-act="modo" data-modo="'+m[0]+'" aria-pressed="'+(modo===m[0])+'" data-tip-pos="bottom" data-tip="'+m[2]+'">'+m[1]+'</button>';}).join('')+'</div>';
}

var deck=[], cards=[]; // deck: lote do gestor (soluções sorteadas pelo servidor, em ordem)
var idx=0; // deck.length = tela final
var sorteando=false, semMais=false;
var hover=null, saving=false, saveError='', animating=false;
var API='/api/avaliacoes', GESTOR_KEY='validacao-gestor';
var gestor=null, online=false, fila=Promise.resolve(); // fila: grava uma avaliação por vez
var sheetEl=document.getElementById('sheet');
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cur(){return cards[idx];}
function sol(){return deck[idx];}
function changed(i){var c=cards[i],s=deck[i];return FILTERS.filter(function(f){return !sameSet(c.sel[f.key]||[],s.initial[f.key]);});}
function avaliadas(){return cards.filter(function(c){return c.decision!==null;}).length;}
function firstPending(){return cards.findIndex(function(c){return c.decision===null;});}
function hasEmpty(){var c=cur();return FILTERS.some(function(f){return c.sel[f.key].length===0;});}

var ICON_OK='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
var ICON_AJ='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
var ICON_NS='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
var ICON_NO='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>';

function header(){return '<header class="top"><img src="'+LOGO+'" alt="Sebrae Indústria"><div class="top-txt"><b>Ficha de validação de produto</b><span>Mapeamento de Soluções para a Indústria</span></div></header>';}

function saveNote(){
  if(saving) return '<p class="save-note">Salvando…</p>';
  if(saveError) return '<p class="warn">'+esc(saveError)+'</p>';
  if(!online) return '<p class="warn">Sem conexão com o servidor: esta avaliação não está sendo salva.</p>';
  return '';
}

// Botão de uma opção do filtro (ficha ainda sem parecer: os filtros ficam sempre editáveis).
function optHtml(f,o,sel,tips){
  var L=LEVELS[o],def=completa()&&DEF_VISIVEL[f.key]&&tips[o];
  var h='<button type="button" class="opt'+(def?' opt-def':'')+(L?' opt-level':'')+'" aria-pressed="'+(sel.indexOf(o)!==-1)+'" data-toggle="'+f.key+'" data-opt="'+esc(o)+'"';
  if(L) h+=' data-level="'+esc(o)+'"';
  else if(tips[o]&&!def) h+=' data-tip="'+esc(tips[o])+'"';
  if(def) return h+'><b>'+esc(o)+'</b><small>'+esc(tips[o])+'</small></button>';
  if(L&&completa()) return h+'>'+esc(o)+'<small>'+esc(L.title.split(' · ')[1]||'')+'</small></button>';
  return h+'>'+esc(o)+'</button>';
}

function rowsHtml(){
  var c=cur(),s=sol(),aberta=c.decision===null,h='';
  FILTERS.forEach(function(f){
    var sel=c.sel[f.key],isMat=f.key==='maturidade';
    var ch=!sameSet(sel,s.initial[f.key]);
    var tips=(window.FILTER_TIPS&&FILTER_TIPS[f.key])||{};
    var tit=tips._titulo||'';
    if(aberta&&!completa()) tit=(tit?tit+' ':'')+'Marque todas que se aplicam.'; // na simplificada a instrução vira dica
    h+='<div class="row'+(aberta?' edit':'')+'"><div class="row-name"><b'+(tit?' class="has-tip" tabindex="0" data-tip="'+esc(tit)+'"':'')+'>'+esc(f.label)+'</b>';
    if(aberta&&completa()) h+='<small class="multi">Marque todas que se aplicam</small>';
    if(isMat&&completa()) h+='<small>Passe o mouse sobre o nível para ver a definição</small>';
    if(ch) h+='<span class="tag-changed">Alterado</span>';
    h+='</div><div class="chips'+(aberta&&completa()&&DEF_VISIVEL[f.key]?' chips-def':'')+'" role="group" aria-label="'+esc(f.label)+'">';
    if(aberta){
      f.options.forEach(function(o){h+=optHtml(f,o,sel,tips);});
    }else{
      ordered(f,sel).forEach(function(o){
        if(isMat&&LEVELS[o]) h+='<button type="button" class="chip-level" data-level="'+esc(o)+'">'+esc(o)+'</button>';
        else h+='<span class="chip"'+(tips[o]?' tabindex="0" data-tip="'+esc(tips[o])+'"':'')+'>'+esc(o)+'</span>';
      });
    }
    h+='</div>';
    if(isMat&&hover&&LEVELS[hover]){var L=LEVELS[hover];h+='<div class="tip" role="tooltip"><div class="tip-head"><b>'+esc(L.title)+'</b><span>'+esc(L.range)+'</span></div><p>'+esc(L.text)+'</p><p class="signal"><strong>Sinal prático:</strong> '+esc(L.signal)+'</p></div>';}
    h+='</div>';
  });
  return h;
}

// Etapas e entregas da ficha Sebraetec (quando houver), para o gestor entender o escopo.
function detalhesFicha(s){
  var h='';
  if(s.como&&s.como.length) h+='<div class="stack ficha-bloco"><span class="label">Como funciona</span><ol class="ficha-lista">'+s.como.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ol></div>';
  if(s.recebe&&s.recebe.length) h+='<div class="stack ficha-bloco"><span class="label">O que a empresa recebe</span><ul class="ficha-lista ficha-recebe">'+s.recebe.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></div>';
  return h;
}
// Descrição com quebras de parágrafo (linha em branco separa parágrafos).
function paragrafos(txt){return String(txt||'').split(/\n\s*\n/).map(function(p){return '<p class="desc">'+esc(p.trim())+'</p>';}).join('');}
function btnLink(s){
  if(!s.link||!/^https?:\/\//.test(s.link)) return '';
  return '<a class="btn-link" href="'+esc(s.link)+'" target="_blank" rel="noopener noreferrer" data-tip-align="start" data-tip="Abre a página da solução em uma nova aba.">Acessar solução <span aria-hidden="true">↗</span></a>';
}
function tagOrigem(s){
  var st=s.origem==='Sebraetec';
  return '<span class="origem '+(st?'origem-st':'origem-sb')+'" tabindex="0" data-tip="'+(st?'Serviço do Sebraetec, com ficha técnica e código Sebraetec.':'Solução do portfólio do Sebrae.')+'">'+(st?'Sebraetec':'Sebrae')+'</span>';
}
function btnReset(){return '<button type="button" class="btn-sm" data-act="reset" data-tip="Apaga sua resposta desta solução para você responder de novo.">Refazer avaliação</button>';}
function btnNext(lbl){return '<button type="button" class="next-btn" data-act="next" data-tip="'+(idx===deck.length-1?'Vai para o resumo do seu lote.':'Avança para a próxima solução do lote.')+'">'+lbl+'</button>';}

// Ficha sem parecer: comentário, os três pareceres e o "Não sei avaliar" (com motivo).
function parecerHtml(){
  var c=cur(),h='<div class="parecer">';
  if(c.ns){
    h+='<span class="label">Por que você não sabe avaliar?</span><div class="ns-motivos">'+
      MOTIVOS_NS.map(function(m){return '<button type="button" class="btn-motivo" data-act="ns-motivo" data-motivo="'+m[0]+'">'+esc(m[1])+'</button>';}).join('')+
      '</div><div class="actions actions-start"><button type="button" class="btn-ghost" data-act="ns-voltar" data-tip-align="start" data-tip="Volta para os pareceres sem registrar nada.">Voltar</button></div>';
    return h+saveNote()+'</div>';
  }
  h+='<div class="field"><label for="comentario">Comentário</label><textarea id="comentario" rows="2" placeholder="Obrigatório quando você altera a classificação ou marca fora do escopo. Ex.: atende também Alimentos e Bebidas.">'+esc(c.comment)+'</textarea></div>'+
    '<span class="label">Parecer</span><div class="decide">'+
    '<button type="button" class="btn-big btn-ok" data-act="approve" data-tip-align="start" data-tip="A classificação está certa do jeito que veio. Salva e passa para a próxima.">'+ICON_OK+'Aprovada como está</button>'+
    '<button type="button" class="btn-big btn-aj" data-act="adjust" data-tip="A solução é da indústria, mas a classificação precisa dos ajustes que você marcou nos filtros. Exige comentário.">'+ICON_AJ+'Aprovada com ajustes</button>'+
    '<button type="button" class="btn-big btn-no" data-act="fora" data-tip-align="end" data-tip="A solução não é para a indústria e deve sair do mapa. Exige comentário.">'+ICON_NO+'Fora do escopo</button>'+
    '<button type="button" class="btn-ns" data-act="dontknow" data-tip="Você não consegue avaliar esta solução. Diga o motivo; ela vai para outro gestor.">'+ICON_NS+'Não sei avaliar</button></div>';
  if(changed(idx).length) h+='<p class="hint-aj">Você alterou a classificação. <button type="button" class="link-btn" data-act="undo" data-tip="Volta os filtros para a classificação original.">Desfazer alterações</button></p>';
  if(c.aviso) h+='<p class="warn" role="alert">'+esc(c.aviso)+'</p>';
  return h+saveNote()+'</div>';
}

// Ficha já respondida: resumo do parecer.
function resultadoHtml(){
  var c=cur(),d=c.decision,nextLbl=idx===deck.length-1?'Concluir':'Próxima solução →',cls,tit,h='';
  if(d==='aprovada'){cls='panel-ok';tit='Você aprovou esta solução como está';h='<p>Classificação mantida.</p>';}
  else if(d==='nao_sei'){cls='panel-ns';tit='Você marcou que não sabe avaliar';h='<p><strong>Motivo:</strong> '+esc(motivoTxt(c.motivo))+'. Esta solução vai para outro gestor.</p>';}
  else if(d==='fora_escopo'){cls='panel-no';tit='Você marcou esta solução como fora do escopo';}
  else if(d==='ajustada'){cls='panel-aj';tit='Você aprovou com ajustes';}
  else{cls='panel-no';tit='Você não aprovou · nova classificação registrada';}
  if(d==='ajustada'||d==='fora_escopo'||d==='nao_aprovada'){
    var chs=changed(idx);
    chs.forEach(function(f){h+='<p><strong>'+esc(f.label)+':</strong> <s style="color:var(--faint)">'+esc(sol().initial[f.key].join(', '))+'</s> → '+esc(ordered(f,c.sel[f.key]).join(', '))+'</p>';});
    if(!chs.length&&d!=='fora_escopo') h+='<p>Nenhum filtro foi alterado.</p>';
  }
  if(c.comment.trim()) h+='<p><strong>Comentário:</strong> '+esc(c.comment)+'</p>';
  return '<div class="panel '+cls+'"><div class="panel-title">'+tit+'</div>'+h+'<div class="panel-row">'+btnReset()+btnNext(nextLbl)+'</div>'+saveNote()+'</div>';
}

function btnRestart(){return '<button type="button" class="btn-ghost" data-act="restart" data-tip="Volta para a primeira solução do lote para revisar suas respostas.">Revisar desde a primeira</button>';}
function doneHtml(){
  if(!deck.length) return header()+'<div class="done"><h1>Não foi possível carregar suas soluções</h1><p>Verifique a internet e recarregue a página.</p></div>';
  var n=avaliadas(),pend=n<deck.length,h;
  if(pend) h='<p>Ainda faltam '+(deck.length-n)+' soluções do seu lote. Suas respostas já estão salvas: dá para continuar agora ou depois.</p><div class="actions">'+btnRestart()+'<button type="button" class="next-btn" data-act="pending" data-tip="Abre a primeira solução do lote que você ainda não respondeu.">Ir para a próxima pendente</button></div>';
  else if(semMais) h='<p>Obrigado! Você já recebeu todas as soluções da base.</p>'+btnRestart()+'';
  else h='<p>Obrigado! Suas respostas ficaram registradas. Se tiver mais um tempinho, pegue outro lote: o sorteio prioriza as soluções que ainda ninguém validou.</p><div class="actions">'+btnRestart()+'<button type="button" class="next-btn" data-act="more"'+(sorteando?' disabled':'')+' data-tip="Sorteia outro lote de soluções, priorizando as que ainda ninguém validou.">'+(sorteando?'Sorteando…':'Quero avaliar mais')+'</button></div>';
  return header()+'<div class="done"><span class="label">Fim do lote</span><h1>Você avaliou '+n+' de '+deck.length+' soluções</h1>'+h+(saveError?'<p class="warn">'+esc(saveError)+'</p>':'')+'</div>';
}

function render(){
  if(idx>=deck.length){sheetEl.innerHTML=doneHtml();renderNav();return;}
  var s=sol(),c=cur(),aberta=c.decision===null;
  sheetEl.innerHTML=header()+
    '<div class="body'+(aberta?' editing':'')+'"><div class="col">'+
      '<div class="stack"><div style="display:flex;align-items:center;gap:12px"><span class="label">Solução</span><span class="num">Nº '+esc(s.num)+'</span>'+tagOrigem(s)+'</div><h1>'+esc(s.nome)+'</h1></div>'+
      '<div class="stack"><span class="label">Descrição</span>'+paragrafos(s.desc)+btnLink(s)+'</div>'+
      detalhesFicha(s)+
      '<div class="price"><span class="label">Valor máximo</span><strong>'+esc(s.preco)+'</strong></div>'+
    '</div><div class="col"><section class="stack" style="gap:10px" aria-labelledby="lbl-filtros">'+
      '<div class="filters-head"><span class="label'+(aberta&&!completa()?' has-tip" tabindex="0" data-tip-align="start" data-tip="'+esc(HINT_FILTROS):'')+'" id="lbl-filtros">Classificação nos filtros</span>'+modoHtml()+'</div>'+
      (aberta&&completa()?'<p class="editing-hint">A classificação atual já vem marcada. Se algo estiver errado, marque ou desmarque as opções e escolha <b>Aprovada com ajustes</b>.</p>':'')+
      '<div class="rows" id="rows">'+rowsHtml()+'</div></section></div>'+
      '<div class="decision-bar" id="decision">'+(aberta?parecerHtml():resultadoHtml())+'</div>'+
    '</div><footer class="foot"><span>Sebrae/PR · Mapeamento de Soluções para a Indústria</span><span>Ficha '+esc(s.num)+'</span></footer>';
  renderNav();
}
function renderRowsOnly(){var r=document.getElementById('rows');if(r)r.innerHTML=rowsHtml();}

function renderNav(){
  document.getElementById('prev').disabled=idx===0||animating;
  document.getElementById('next').disabled=idx>=deck.length||animating;
  document.getElementById('count').textContent=idx<deck.length?('Solução '+(idx+1)+' de '+deck.length):'Concluído';
  var n=avaliadas();
  document.getElementById('bar-fill').style.width=(100*n/deck.length)+'%';
  document.getElementById('done-count').textContent=n+' avaliadas';
}

function go(to,dir){
  if(animating||to<0||to>deck.length||to===idx) return;
  hover=null;saveError='';
  var c=idx<deck.length?cur():null;
  if(c){c.ns=false;c.aviso='';} // alterações nos filtros sem parecer ficam guardadas, mas não são salvas
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
  var s=deck[i],c=cards[i],avaliacao=null;
  if(decisao!==null){
    var sel={};FILTERS.forEach(function(f){sel[f.key]=ordered(f,c.sel[f.key]);});
    avaliacao={decisao:decisao,nomeSolucao:s.nome,classificacao:sel,alterados:changed(i).map(function(f){return f.key;}),comentario:c.comment.trim(),tempoSegundos:Math.round(c.ms/1000)};
    if(decisao==='nao_sei') avaliacao.motivoNaoSei=c.motivo;
  }
  var body={nome:gestor.nome,email:gestor.email,solucao:s.id,avaliacao:avaliacao};
  pendentes++;saving=true;saveError='';if(i===idx)render();
  fila=fila.then(function(){return post(body);}).catch(function(){
    saveError='Não foi possível salvar a avaliação de "'+s.nome+'". Volte nela e responda de novo em instantes.';
  }).then(function(){
    pendentes--;saving=pendentes>0;if(!animating)render();
  });
}

// Registra o parecer e passa para a próxima ficha.
function decide(d){
  var i=idx,c=cur();
  c.decision=d;c.aviso='';c.ns=false;hover=null;render();persist(i,d);
  setTimeout(function(){if(idx===i)go(i+1,1);},650);
}
function avisa(msg,campo){
  cur().aviso=msg;render();
  if(campo){var t=document.getElementById('comentario');if(t)t.focus();}
}

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-toggle]');
  if(t){var c=cur(),k=t.getAttribute('data-toggle'),o=t.getAttribute('data-opt'),arr=c.sel[k];
    c.sel[k]=arr.indexOf(o)!==-1?arr.filter(function(x){return x!==o;}):arr.concat([o]);c.aviso='';
    render();var again=sheetEl.querySelector('[data-toggle="'+k+'"][data-opt="'+CSS.escape(o)+'"]');if(again)again.focus();return;}
  if(e.target.closest('#prev')){go(idx-1,-1);return;}
  if(e.target.closest('#next')){go(idx+1,1);return;}
  var a=e.target.closest('[data-act]');if(!a||animating)return;
  var act=a.getAttribute('data-act'),i=idx,c=cur(),mudou=c&&changed(i).length>0,com=c&&c.comment.trim();
  if(act==='approve'){
    if(mudou) avisa('Você alterou a classificação. Para aprovar como está, desfaça as alterações; para manter as mudanças, escolha "Aprovada com ajustes".');
    else decide('aprovada');
  }
  else if(act==='adjust'){
    if(!mudou) avisa('Para aprovar com ajustes, marque ou desmarque as opções nos filtros ao lado.');
    else if(hasEmpty()) avisa('Marque ao menos uma opção em cada filtro.');
    else if(!com) avisa('Explique no comentário o porquê das alterações.',true);
    else decide('ajustada');
  }
  else if(act==='fora'){
    if(!com) avisa('Explique no comentário por que a solução está fora do escopo.',true);
    else decide('fora_escopo');
  }
  else if(act==='modo'){modo=a.getAttribute('data-modo');try{localStorage.setItem(MODO_KEY,modo);}catch(e){}render();var b=sheetEl.querySelector('[data-act="modo"][data-modo="'+modo+'"]');if(b)b.focus();}
  else if(act==='dontknow'){c.ns=true;c.aviso='';render();}
  else if(act==='ns-voltar'){c.ns=false;render();}
  else if(act==='ns-motivo'){c.motivo=a.getAttribute('data-motivo');c.sel=initialSel(sol());decide('nao_sei');}
  else if(act==='undo'){c.sel=initialSel(sol());c.aviso='';render();}
  else if(act==='reset'){var ms=c.ms;cards[i]=freshCard(sol());cards[i].ms=ms;hover=null;render();persist(i,null);}
  else if(act==='next'){go(i+1,1);}
  else if(act==='restart'){go(0,-1);}
  else if(act==='pending'){var p=firstPending();if(p>=0)go(p,-1);}
  else if(act==='more'){
    if(sorteando)return;
    sorteando=true;saveError='';render();
    fila=fila.then(pedirLote).then(function(r){
      var antes=deck.length;aplicaLote(r.lote);semMais=deck.length===antes;
    }).catch(function(){saveError='Não foi possível sortear mais soluções. Tente de novo em instantes.';})
      .then(function(){sorteando=false;render();}); // idx já aponta para a 1ª nova, se houver
  }
});
document.addEventListener('input',function(e){
  if(e.target.id!=='comentario')return;
  var c=cur();c.comment=e.target.value;
  if(c.aviso){c.aviso='';var w=sheetEl.querySelector('.parecer .warn[role="alert"]');if(w)w.remove();}
});

// Tempo por resposta: soma 1 s por segundo com a ficha na tela, a aba visível e alguém mexendo
// (para de contar depois de 2 min sem mouse, teclado, toque ou rolagem).
var ultimaAtividade=Date.now();
['mousemove','keydown','pointerdown','scroll','touchstart'].forEach(function(ev){window.addEventListener(ev,function(){ultimaAtividade=Date.now();},{passive:true});});
setInterval(function(){
  if(document.hidden||!gestor||idx>=deck.length||Date.now()-ultimaAtividade>120000)return;
  var c=cur();if(c&&c.decision===null)c.ms+=1000;
},1000);

function showLevel(el){var lv=el.getAttribute('data-level');if(hover===lv)return;hover=lv;var f=document.activeElement===el;renderRowsOnly();if(f){var n=sheetEl.querySelector('[data-level="'+CSS.escape(lv)+'"]');if(n)n.focus();}}
function hideLevel(){if(hover===null)return;hover=null;var tip=sheetEl.querySelector('.tip');if(tip)tip.remove();}
function alinhaTip(e){
  var el=e.target.closest&&e.target.closest('[data-tip]');if(!el||!sheetEl.contains(el))return;
  var r=el.getBoundingClientRect(),c=sheetEl.getBoundingClientRect(),meia=150-r.width/2;
  if(r.right+meia>c.right-8)el.setAttribute('data-tip-align','end');
  else if(r.left-meia<c.left+8)el.setAttribute('data-tip-align','start');
}
sheetEl.addEventListener('mouseover',alinhaTip);
sheetEl.addEventListener('focusin',alinhaTip);
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

// Soluções que aparecem sempre, em primeiro lugar, para todos os gestores (fora do sorteio).
var FIXAS=['sol-190'];
function pedirLote(){return post({acao:'lote',nome:gestor.nome,email:gestor.email,ids:SOLUCOES.map(function(s){return s.id;}).filter(function(id){return FIXAS.indexOf(id)===-1;})});}
// Acrescenta ao deck as soluções do lote que ainda não estão nele (ignora ids que saíram da base).
function aplicaLote(ids){
  var porId={},tem={};
  SOLUCOES.forEach(function(s){porId[s.id]=s;});
  deck.forEach(function(s){tem[s.id]=true;});
  ids.forEach(function(id){if(porId[id]&&!tem[id]){tem[id]=true;deck.push(porId[id]);cards.push(freshCard(porId[id]));}});
}

// Carrega o lote e as respostas deste gestor (sorteia o 1º lote se ainda não tiver) e abre na primeira pendente.
function start(){
  document.getElementById('login').hidden=true;
  document.getElementById('app').hidden=false;
  document.getElementById('session-nome').textContent=gestor.nome+' ('+gestor.email+')';
  deck=[];cards=[];idx=0;
  sheetEl.innerHTML=header()+'<div class="done"><p>Carregando suas soluções…</p></div>';
  fetch(API+'?email='+encodeURIComponent(gestor.email),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(d){
    return (d.lote&&d.lote.length?Promise.resolve(d):pedirLote()).then(function(l){
      aplicaLote(FIXAS.concat(l.lote)); // fixas primeiro; o resto na ordem do sorteio
      var av=d.avaliacoes||{};
      deck.forEach(function(s,i){var m=av[s.id];if(!m||!PARECER[m.decisao])return;
        var c=cards[i];
        c.ms=(Number(m.tempoSegundos)||0)*1000;
        c.decision=m.decisao;c.comment=m.comentario||'';c.motivo=m.motivoNaoSei||'';
        // a classificação gravada pode ter opções que depois foram unificadas
        if(m.decisao!=='aprovada'&&m.decisao!=='nao_sei') FILTERS.forEach(function(f){var v=m.classificacao&&m.classificacao[f.key];if(Array.isArray(v)&&v.length)c.sel[f.key]=unifica(v);});
      });
      online=true;
      var p=firstPending();idx=p<0?deck.length:p;
    });
  }).catch(function(){online=false;deck=[];cards=[];idx=0;}).then(render);
}

gestor=readGestor();
if(gestor) start(); else showLogin();
})();
