/* Painel da validação. Depende de filtros.js (FILTERS) e data.js (SOLUCOES). */
(function(){
var API='/api/admin', AUTH_KEY='validacao-admin';
var auth=null, gestores=[], lixeira=[], filtro='todas', busca='', abertas={}, carregando=false;
var $=function(id){return document.getElementById(id);};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(n){return n.toLocaleString('pt-BR');}
function pct(n,t){return t?Math.round(100*n/t)+'%':'0%';}
function fmtTempo(seg){seg=Math.round(seg||0);if(!seg)return '—';var m=Math.floor(seg/60),r=seg%60;return m?(m+' min'+(r?' '+r+' s':'')):r+' s';}
// Respostas anteriores à medição de tempo não têm tempoSegundos.
function medido(a){return a.tempoSegundos!=null&&a.tempoSegundos!=='';}
function tempoTxt(a){return !medido(a)?'não medido':(Number(a.tempoSegundos)>0?fmtTempo(a.tempoSegundos):'menos de 1 s');}
function media(l){l=l.filter(function(x){return x>0;});return l.length?l.reduce(function(a,b){return a+b;},0)/l.length:0;}
function fmtData(iso){if(!iso)return '—';try{return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return '—';}}
function readAuth(){try{return sessionStorage.getItem(AUTH_KEY);}catch(e){return null;}}
function saveAuth(v){try{if(v)sessionStorage.setItem(AUTH_KEY,v);else sessionStorage.removeItem(AUTH_KEY);}catch(e){}}

function api(method,body,raw,qs){
  return fetch(API+(raw?'?formato=csv':(qs||'')),{method:method,cache:'no-store',headers:Object.assign({authorization:'Basic '+auth},body?{'content-type':'application/json'}:{}),body:body?JSON.stringify(body):undefined})
    .then(function(r){
      if(r.status===401){sair('Sessão expirada ou senha alterada. Entre de novo.');throw new Error('401');}
      if(raw) return r.ok?r.blob():Promise.reject(new Error('Erro '+r.status));
      return r.json().catch(function(){return {};}).then(function(d){if(!r.ok)throw new Error(d.erro||'Erro '+r.status);return d;});
    });
}

/* ---------- login ---------- */
function mostrarLogin(msg){
  $('painel').hidden=true;$('login').hidden=false;
  var e=$('login-erro');e.hidden=!msg;e.textContent=msg||'';
}
function sair(msg){auth=null;saveAuth(null);mostrarLogin(msg);}
$('login-form').addEventListener('submit',function(e){
  e.preventDefault();
  var u=$('login-usuario').value.trim(),s=$('login-senha').value,btn=$('login-btn');
  if(!u||!s){mostrarLogin('Informe usuário e senha.');return;}
  auth=btoa(unescape(encodeURIComponent(u+':'+s)));
  btn.disabled=true;btn.textContent='Entrando…';
  api('POST',{acao:'entrar'}).then(function(){saveAuth(auth);$('login-senha').value='';abrir();})
    .catch(function(x){if(x.message!=='401')mostrarLogin(x instanceof TypeError?'Não foi possível conectar ao servidor.':x.message);else mostrarLogin('Usuário ou senha inválidos.');})
    .then(function(){btn.disabled=false;btn.textContent='Entrar';});
});
$('sair').addEventListener('click',function(){sair();});

/* ---------- dados ---------- */
var porId={};SOLUCOES.forEach(function(s){porId[s.id]=s;});

// Por solução: avaliações (com o gestor) e reservas (gestores com a solução no lote, sem resposta).
function consolidar(){
  var st={};
  SOLUCOES.forEach(function(s){st[s.id]={aval:[],res:[]};});
  gestores.forEach(function(g){
    var av=g.avaliacoes||{};
    Object.keys(av).forEach(function(id){if(st[id])st[id].aval.push({g:g,a:av[id]});});
    (g.lote||[]).forEach(function(id){if(st[id]&&!av[id])st[id].res.push(g);});
  });
  SOLUCOES.forEach(function(s){
    var x=st[s.id];
    x.aval.sort(function(a,b){return String(b.a.em).localeCompare(String(a.a.em));});
    x.ok=x.aval.filter(function(v){return v.a.decisao==='aprovada';}).length;
    x.no=x.aval.filter(function(v){return v.a.decisao==='nao_aprovada';}).length;
    x.ns=x.aval.filter(function(v){return v.a.decisao==='nao_sei';}).length;
    var novas=x.aval.filter(function(v){return v.a.decisao==='nao_aprovada';}).map(function(v){return JSON.stringify(v.a.classificacao||{});});
    x.div=(x.ok>0&&x.no>0)||novas.some(function(c){return c!==novas[0];});
    x.estado=(x.ok+x.no)?'validada':(x.res.length?'reservada':'livre'); // "não sei" não valida
  });
  return st;
}

/* ---------- render ---------- */
var FILTROS=[
  {k:'todas',t:'Todas',f:function(){return true;}},
  {k:'livre',t:'Sem ninguém',f:function(x){return x.estado==='livre';}},
  {k:'reservada',t:'Reservadas, sem resposta',f:function(x){return x.estado==='reservada';}},
  {k:'validada',t:'Validadas',f:function(x){return x.estado==='validada';}},
  {k:'nao',t:'Com não aprovação',f:function(x){return x.no>0;}},
  {k:'ns',t:'Com "não sei"',f:function(x){return x.ns>0;}},
  {k:'div',t:'Com divergência',f:function(x){return x.div;}}
];

function render(){
  var st=consolidar(),total=SOLUCOES.length;
  var n={validada:0,reservada:0,livre:0},avTot=0,ok=0,no=0,ns=0,div=0,tempos=[];
  SOLUCOES.forEach(function(s){var x=st[s.id];n[x.estado]++;avTot+=x.aval.length;ok+=x.ok;no+=x.no;ns+=x.ns;if(x.div)div++;
    x.aval.forEach(function(v){tempos.push(Number(v.a.tempoSegundos)||0);});});

  $('hero-num').textContent=pct(n.validada,total);
  $('hero-txt').textContent=fmt(n.validada)+' de '+fmt(total)+' soluções já têm pelo menos uma validação';
  var segs=[['seg-ok','Validadas',n.validada],['seg-res','Reservadas em lotes, sem resposta',n.reservada],['seg-livre','Ainda sem ninguém',n.livre]];
  $('meter').innerHTML=segs.filter(function(s){return s[2]>0;}).map(function(s){return '<span class="'+s[0]+'" style="flex:'+s[2]+'" title="'+esc(s[1])+': '+s[2]+'"></span>';}).join('');
  $('meter').setAttribute('aria-label',segs.map(function(s){return s[1]+': '+s[2];}).join(', '));
  $('legend').innerHTML=segs.map(function(s){return '<li><i class="'+s[0]+'"></i>'+esc(s[1])+' <b>'+fmt(s[2])+'</b></li>';}).join('');

  var kpis=[
    ['Gestores',gestores.length,''],
    ['Avaliações feitas',avTot,''],
    ['Aprovadas',ok,pct(ok,avTot)+' das avaliações'],
    ['Não aprovadas',no,pct(no,avTot)+' das avaliações'],
    ['Não sei',ns,'a solução volta para o sorteio'],
    ['Com divergência',div,'soluções com pareceres diferentes'],
    ['Tempo médio',fmtTempo(media(tempos)),'por resposta']
  ];
  $('kpis').innerHTML=kpis.map(function(k){return '<div class="kpi"><span>'+k[0]+'</span><strong>'+(typeof k[1]==='number'?fmt(k[1]):esc(k[1]))+'</strong>'+(k[2]?'<small>'+esc(k[2])+'</small>':'')+'</div>';}).join('');

  renderGestores();
  renderSolucoes(st);
  $('atualizado').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function renderGestores(){
  var rows=gestores.map(function(g){
    var av=g.avaliacoes||{},ids=Object.keys(av),lote=g.lote||[];
    var pend=lote.filter(function(id){return !av[id];}).length;
    var conta=function(d){return ids.filter(function(id){return av[id].decisao===d;}).length;};
    var ult=ids.map(function(id){return av[id].em;}).sort().pop();
    var tm=media(ids.map(function(id){return Number(av[id].tempoSegundos)||0;}));
    return {g:g,lote:lote.length,resp:ids.length,pend:pend,ok:conta('aprovada'),no:conta('nao_aprovada'),ns:conta('nao_sei'),tm:tm,ult:ult};
  }).sort(function(a,b){return String(b.ult||'').localeCompare(String(a.ult||''));});
  $('gestores-vazio').hidden=rows.length>0;
  $('gestores').innerHTML=rows.map(function(r){
    return '<tr><td><b>'+esc(r.g.nome)+'</b><small>'+esc(r.g.email)+'</small></td>'+
      '<td class="num-col">'+r.lote+'</td><td class="num-col">'+r.resp+'</td><td class="num-col">'+r.pend+'</td>'+
      '<td class="num-col">'+r.ok+'</td><td class="num-col">'+r.no+'</td><td class="num-col">'+r.ns+'</td><td class="num-col">'+fmtTempo(r.tm)+'</td><td>'+fmtData(r.ult)+'</td>'+
      '<td><div class="row-actions">'+
        '<button type="button" class="btn-mini" data-liberar="'+esc(r.g.email)+'"'+(r.pend?'':' disabled')+' data-tip-align="end" data-tip="Devolve para a fila as soluções do lote desta pessoa que ainda estão sem resposta. As respostas dadas continuam.">Liberar pendentes</button>'+
        '<button type="button" class="btn-mini danger" data-remover="'+esc(r.g.email)+'" data-nome="'+esc(r.g.nome)+'" data-tip-align="end" data-tip="Move esta pessoa e todas as respostas dela para a lixeira. Dá para restaurar depois.">Remover</button>'+
      '</div></td></tr>';
  }).join('');
}

var ICON_TEMPO='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/></svg>';
function tags(x){
  var h='';
  if(x.estado==='livre') h+='<span class="tag tag-livre">Sem ninguém</span>';
  if(x.res.length) h+='<span class="tag tag-res">'+x.res.length+' reservada'+(x.res.length>1?'s':'')+'</span>';
  if(x.ok) h+='<span class="tag tag-ok">'+x.ok+' aprovada'+(x.ok>1?'s':'')+'</span>';
  if(x.no) h+='<span class="tag tag-no">'+x.no+' não aprovada'+(x.no>1?'s':'')+'</span>';
  if(x.ns) h+='<span class="tag tag-ns">'+x.ns+' não sei</span>';
  if(x.div) h+='<span class="tag tag-div">Divergência</span>';
  var t=x.aval.filter(function(v){return medido(v.a);}).map(function(v){return Number(v.a.tempoSegundos)||0;});
  if(t.length) h+='<span class="tag tag-tempo" title="Tempo gasto para responder'+(t.length>1?' (média de '+t.length+' respostas)':'')+'">'+ICON_TEMPO+(t.length>1?'média ':'')+esc(fmtTempo(t.reduce(function(a,b){return a+b;},0)/t.length)||'menos de 1 s').replace('—','menos de 1 s')+'</span>';
  return h;
}

function detalhe(s,x){
  var h='';
  if(!x.aval.length) h+='<p class="empty">Ninguém avaliou ainda.</p>';
  x.aval.forEach(function(v){
    var a=v.a,okd=a.decisao==='aprovada',nsd=a.decisao==='nao_sei';
    var tag=okd?['tag-ok','Aprovada']:(nsd?['tag-ns','Não sei']:['tag-no','Não aprovada']);
    h+='<div class="aval"><div class="aval-head"><b>'+esc(v.g.nome)+'</b><span class="tag '+tag[0]+'">'+tag[1]+'</span><time>'+fmtData(a.em)+'</time><span class="tempo'+(medido(a)?'':' tempo-nm')+'">'+ICON_TEMPO+'Tempo: '+tempoTxt(a)+'</span></div>';
    if(a.decisao==='nao_aprovada'){
      var alt=Array.isArray(a.alterados)?a.alterados:[];
      FILTERS.forEach(function(f){if(alt.indexOf(f.key)===-1)return;
        var novo=(a.classificacao&&a.classificacao[f.key])||[];
        h+='<div><strong>'+esc(f.label)+':</strong> <s>'+esc(s.initial[f.key].join(', '))+'</s> → '+esc(novo.join(', '))+'</div>';});
      if(!alt.length) h+='<div>Não aprovou, sem alterar os filtros.</div>';
    }
    if(a.comentario) h+='<div><strong>Comentário:</strong> '+esc(a.comentario)+'</div>';
    h+='</div>';
  });
  if(x.res.length) h+='<p class="save-note">No lote de: '+x.res.map(function(g){return esc(g.nome);}).join(', ')+' (sem resposta ainda)</p>';
  return h;
}

function renderSolucoes(st){
  st=st||consolidar();
  var f=FILTROS.filter(function(x){return x.k===filtro;})[0];
  $('filtros').innerHTML=FILTROS.map(function(x){
    var c=SOLUCOES.filter(function(s){return x.f(st[s.id]);}).length;
    return '<button type="button" class="opt" data-filtro="'+x.k+'" aria-pressed="'+(x.k===filtro)+'" data-tip="Mostra só as soluções: '+esc(x.t.toLowerCase())+'.">'+esc(x.t)+'<span class="n">'+c+'</span></button>';
  }).join('');
  var q=busca.trim().toLowerCase();
  var lista=SOLUCOES.filter(function(s){return f.f(st[s.id])&&(!q||s.nome.toLowerCase().indexOf(q)!==-1||s.num.indexOf(q.replace(/^0+/,''))!==-1);});
  $('solucoes').innerHTML=lista.length?lista.map(function(s){
    var x=st[s.id];
    return '<details class="sol" data-id="'+esc(s.id)+'"'+(abertas[s.id]?' open':'')+'><summary><span class="n-sol">Nº '+esc(s.num)+'</span><span class="nome">'+esc(s.nome)+' <span class="origem '+(s.origem==='Sebraetec'?'origem-st':'origem-sb')+'">'+esc(s.origem||'Sebrae')+'</span></span><span class="tags">'+tags(x)+'</span></summary>'+
      '<div class="sol-body">'+detalhe(s,x)+'</div></details>';
  }).join(''):'<p class="empty" style="padding:14px 4px">Nenhuma solução neste filtro.</p>';
}

function renderLixeira(){
  $('lixeira-vazia').hidden=lixeira.length>0;$('lixeira-wrap').hidden=!lixeira.length;
  $('lixeira').innerHTML=lixeira.map(function(x){
    return '<tr><td><b>'+esc(x.nome)+'</b><small>'+esc(x.email)+'</small></td><td class="num-col">'+x.respostas+'</td><td>'+fmtData(x.removidoEm)+'</td>'+
      '<td><div class="row-actions"><button type="button" class="btn-mini" data-restaurar="'+esc(x.id)+'" data-tip-align="end" data-tip="Devolve esta pessoa ao painel com todas as respostas. Se ela já entrou de novo, as respostas são juntadas.">Restaurar</button>'+
      '<button type="button" class="btn-mini danger" data-excluir="'+esc(x.id)+'" data-nome="'+esc(x.nome)+'" data-tip-align="end" data-tip="Apaga de vez esta pessoa e as respostas dela. Não pode ser desfeito.">Excluir definitivamente</button></div></td></tr>';
  }).join('');
}

/* ---------- ações ---------- */
function carregar(){
  if(carregando)return;carregando=true;$('erro').hidden=true;
  Promise.all([api('GET'),api('GET',null,false,'?lixeira=1')]).then(function(r){gestores=r[0].gestores||[];lixeira=r[1].itens||[];render();renderLixeira();})
    .catch(function(x){if(x.message==='401')return;$('erro').hidden=false;$('erro').textContent='Não foi possível carregar os dados: '+x.message;})
    .then(function(){carregando=false;});
}
function abrir(){$('login').hidden=true;$('painel').hidden=false;carregar();}

document.addEventListener('click',function(e){
  var t=e.target.closest('[data-filtro]');
  if(t){filtro=t.getAttribute('data-filtro');renderSolucoes();return;}
  t=e.target.closest('[data-liberar]');
  if(t){var em=t.getAttribute('data-liberar');t.disabled=true;
    api('POST',{acao:'liberar',email:em}).then(carregar).catch(function(x){if(x.message!=='401')alert('Não foi possível liberar: '+x.message);t.disabled=false;});return;}
  t=e.target.closest('[data-remover]');
  if(t){var em2=t.getAttribute('data-remover');
    if(!confirm('Mover '+t.getAttribute('data-nome')+' ('+em2+') para a lixeira? As respostas saem do painel e do CSV, mas dá para restaurar pela Lixeira.'))return;
    t.disabled=true;
    api('POST',{acao:'remover',email:em2}).then(carregar).catch(function(x){if(x.message!=='401')alert('Não foi possível remover: '+x.message);t.disabled=false;});return;}
});
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-restaurar]');
  if(t){t.disabled=true;
    api('POST',{acao:'restaurar',id:t.getAttribute('data-restaurar')}).then(carregar).catch(function(x){if(x.message!=='401')alert('Não foi possível restaurar: '+x.message);t.disabled=false;});return;}
  t=e.target.closest('[data-excluir]');
  if(t){
    if(!confirm('Excluir '+t.getAttribute('data-nome')+' definitivamente? As respostas serão apagadas de vez e isso não pode ser desfeito.'))return;
    t.disabled=true;
    api('POST',{acao:'excluir_lixeira',id:t.getAttribute('data-excluir')}).then(carregar).catch(function(x){if(x.message!=='401')alert('Não foi possível excluir: '+x.message);t.disabled=false;});}
});
document.addEventListener('toggle',function(e){var d=e.target;if(d.classList&&d.classList.contains('sol'))abertas[d.getAttribute('data-id')]=d.open;},true);
$('busca').addEventListener('input',function(e){busca=e.target.value;renderSolucoes();});
$('atualizar').addEventListener('click',carregar);
$('csv').addEventListener('click',function(){
  var b=$('csv');b.disabled=true;
  api('GET',null,true).then(function(blob){
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='avaliacoes-solucoes.csv';document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);
  }).catch(function(x){if(x.message!=='401'){$('erro').hidden=false;$('erro').textContent='Não foi possível baixar o CSV: '+x.message;}}).then(function(){b.disabled=false;});
});
setInterval(function(){if(auth&&!document.hidden&&!$('painel').hidden)carregar();},60000);

auth=readAuth();
if(auth) abrir(); else mostrarLogin();
})();
