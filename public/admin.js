/* Painel da validação. Depende de filtros.js (FILTERS) e data.js (SOLUCOES). */
(function(){
var API='/api/admin', AUTH_KEY='validacao-admin';
var auth=null, gestores=[], filtro='todas', busca='', abertas={}, carregando=false;
var $=function(id){return document.getElementById(id);};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(n){return n.toLocaleString('pt-BR');}
function pct(n,t){return t?Math.round(100*n/t)+'%':'0%';}
function fmtData(iso){if(!iso)return '—';try{return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return '—';}}
function readAuth(){try{return sessionStorage.getItem(AUTH_KEY);}catch(e){return null;}}
function saveAuth(v){try{if(v)sessionStorage.setItem(AUTH_KEY,v);else sessionStorage.removeItem(AUTH_KEY);}catch(e){}}

function api(method,body,raw){
  return fetch(API+(raw?'?formato=csv':''),{method:method,cache:'no-store',headers:Object.assign({authorization:'Basic '+auth},body?{'content-type':'application/json'}:{}),body:body?JSON.stringify(body):undefined})
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
    x.no=x.aval.length-x.ok;
    var novas=x.aval.filter(function(v){return v.a.decisao==='nao_aprovada';}).map(function(v){return JSON.stringify(v.a.classificacao||{});});
    x.div=(x.ok>0&&x.no>0)||novas.some(function(c){return c!==novas[0];});
    x.estado=x.aval.length?'validada':(x.res.length?'reservada':'livre');
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
  {k:'div',t:'Com divergência',f:function(x){return x.div;}}
];

function render(){
  var st=consolidar(),total=SOLUCOES.length;
  var n={validada:0,reservada:0,livre:0},avTot=0,ok=0,no=0,div=0;
  SOLUCOES.forEach(function(s){var x=st[s.id];n[x.estado]++;avTot+=x.aval.length;ok+=x.ok;no+=x.no;if(x.div)div++;});

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
    ['Com divergência',div,'soluções com pareceres diferentes']
  ];
  $('kpis').innerHTML=kpis.map(function(k){return '<div class="kpi"><span>'+k[0]+'</span><strong>'+fmt(k[1])+'</strong>'+(k[2]?'<small>'+esc(k[2])+'</small>':'')+'</div>';}).join('');

  renderGestores();
  renderSolucoes(st);
  $('atualizado').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function renderGestores(){
  var rows=gestores.map(function(g){
    var av=g.avaliacoes||{},ids=Object.keys(av),lote=g.lote||[];
    var pend=lote.filter(function(id){return !av[id];}).length;
    var ok=ids.filter(function(id){return av[id].decisao==='aprovada';}).length;
    var ult=ids.map(function(id){return av[id].em;}).sort().pop();
    return {g:g,lote:lote.length,resp:ids.length,pend:pend,ok:ok,no:ids.length-ok,ult:ult};
  }).sort(function(a,b){return String(b.ult||'').localeCompare(String(a.ult||''));});
  $('gestores-vazio').hidden=rows.length>0;
  $('gestores').innerHTML=rows.map(function(r){
    return '<tr><td><b>'+esc(r.g.nome)+'</b><small>'+esc(r.g.email)+'</small></td>'+
      '<td class="num-col">'+r.lote+'</td><td class="num-col">'+r.resp+'</td><td class="num-col">'+r.pend+'</td>'+
      '<td class="num-col">'+r.ok+'</td><td class="num-col">'+r.no+'</td><td>'+fmtData(r.ult)+'</td>'+
      '<td><div class="row-actions">'+
        '<button type="button" class="btn-mini" data-liberar="'+esc(r.g.email)+'"'+(r.pend?'':' disabled')+' title="Devolve para a fila as soluções do lote ainda sem resposta">Liberar pendentes</button>'+
        '<button type="button" class="btn-mini danger" data-remover="'+esc(r.g.email)+'" data-nome="'+esc(r.g.nome)+'">Remover</button>'+
      '</div></td></tr>';
  }).join('');
}

function tags(x){
  var h='';
  if(x.estado==='livre') h+='<span class="tag tag-livre">Sem ninguém</span>';
  if(x.res.length) h+='<span class="tag tag-res">'+x.res.length+' reservada'+(x.res.length>1?'s':'')+'</span>';
  if(x.ok) h+='<span class="tag tag-ok">'+x.ok+' aprovada'+(x.ok>1?'s':'')+'</span>';
  if(x.no) h+='<span class="tag tag-no">'+x.no+' não aprovada'+(x.no>1?'s':'')+'</span>';
  if(x.div) h+='<span class="tag tag-div">Divergência</span>';
  return h;
}

function detalhe(s,x){
  var h='';
  if(!x.aval.length) h+='<p class="empty">Ninguém avaliou ainda.</p>';
  x.aval.forEach(function(v){
    var a=v.a,okd=a.decisao==='aprovada';
    h+='<div class="aval"><div class="aval-head"><b>'+esc(v.g.nome)+'</b><span class="tag '+(okd?'tag-ok':'tag-no')+'">'+(okd?'Aprovada':'Não aprovada')+'</span><time>'+fmtData(a.em)+'</time></div>';
    if(!okd){
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
    return '<button type="button" class="opt" data-filtro="'+x.k+'" aria-pressed="'+(x.k===filtro)+'">'+esc(x.t)+'<span class="n">'+c+'</span></button>';
  }).join('');
  var q=busca.trim().toLowerCase();
  var lista=SOLUCOES.filter(function(s){return f.f(st[s.id])&&(!q||s.nome.toLowerCase().indexOf(q)!==-1||s.num.indexOf(q.replace(/^0+/,''))!==-1);});
  $('solucoes').innerHTML=lista.length?lista.map(function(s){
    var x=st[s.id];
    return '<details class="sol" data-id="'+esc(s.id)+'"'+(abertas[s.id]?' open':'')+'><summary><span class="n-sol">Nº '+esc(s.num)+'</span><span class="nome">'+esc(s.nome)+'</span><span class="tags">'+tags(x)+'</span></summary>'+
      '<div class="sol-body">'+detalhe(s,x)+'</div></details>';
  }).join(''):'<p class="empty" style="padding:14px 4px">Nenhuma solução neste filtro.</p>';
}

/* ---------- ações ---------- */
function carregar(){
  if(carregando)return;carregando=true;$('erro').hidden=true;
  api('GET').then(function(d){gestores=d.gestores||[];render();})
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
    if(!confirm('Remover '+t.getAttribute('data-nome')+' ('+em2+')? As avaliações dessa pessoa serão apagadas e isso não pode ser desfeito.'))return;
    t.disabled=true;
    api('POST',{acao:'remover',email:em2}).then(carregar).catch(function(x){if(x.message!=='401')alert('Não foi possível remover: '+x.message);t.disabled=false;});return;}
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
