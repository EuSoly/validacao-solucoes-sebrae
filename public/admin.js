/* Painel da validação. Depende de filtros.js (FILTERS, unifica) e data.js (SOLUCOES). */
(function(){
var API='/api/admin', AUTH_KEY='validacao-admin';
var auth=null, gestores=[], lixeira=[], busca='', abertas={}, carregando=false;
var $=function(id){return document.getElementById(id);};

// Copia o título de cada coluna para as células (data-label): em tela estreita a tabela vira cartões.
function rotular(raiz){
  (raiz||document).querySelectorAll('table.tabela').forEach(function(t){
    var tit=[].map.call(t.querySelectorAll('thead th'),function(th){return th.textContent.trim();});
    t.querySelectorAll('tbody tr').forEach(function(tr){[].forEach.call(tr.children,function(td,i){if(tit[i])td.setAttribute('data-label',tit[i]);});});
  });
}
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
// Pareceres que reclassificam: "com ajustes" e o "não aprovada" da 1ª rodada.
function reclassifica(d){return d==='ajustada'||d==='nao_aprovada';}
var MOTIVO_NS={nao_conheco:'Não conheço a solução',descricao:'A descrição não basta',industria:'Não sei se é da indústria'};
function motivoNs(a){return MOTIVO_NS[a.motivoNaoSei]||MOTIVO_NS.nao_conheco;} // antes do motivo, o botão era "Não conheço"

// Por solução: avaliações (com o gestor) e reservas (gestores com a solução no lote, sem resposta).
function consolidar(){
  var st={};
  SOLUCOES.forEach(function(s){st[s.id]={aval:[],res:[]};});
  gestores.forEach(function(g){
    var av=g.avaliacoes||{};
    Object.keys(av).forEach(function(id){if(st[id])st[id].aval.push({g:g,a:av[id],r:analisa(porId[id],av[id])});});
    (g.lote||[]).forEach(function(id){if(st[id]&&!av[id])st[id].res.push(g);});
  });
  SOLUCOES.forEach(function(s){
    var x=st[s.id];
    x.aval.sort(function(a,b){return String(b.a.em).localeCompare(String(a.a.em));});
    x.ok=x.aval.filter(function(v){return v.a.decisao==='aprovada';}).length;
    x.no=x.aval.filter(function(v){return reclassifica(v.a.decisao);}).length;
    x.fe=x.aval.filter(function(v){return v.a.decisao==='fora_escopo';}).length;
    x.ns=x.aval.filter(function(v){return v.a.decisao==='nao_sei';}).length;
    var novas=x.aval.filter(function(v){return reclassifica(v.a.decisao);}).map(function(v){return v.r.add.concat(v.r.rem).sort().join(';');});
    x.div=[x.ok,x.no,x.fe].filter(Boolean).length>1||novas.some(function(c){return c!==novas[0];});
    x.estado=(x.ok+x.no+x.fe)?'validada':(x.res.length?'reservada':'livre'); // "não sei" não valida
  });
  return st;
}

/* ---------- render ---------- */
function render(){
  var st=consolidar(),total=SOLUCOES.length;
  var n={validada:0,reservada:0,livre:0},avTot=0,ok=0,no=0,fe=0,ns=0,div=0,tempos=[];
  SOLUCOES.forEach(function(s){var x=st[s.id];n[x.estado]++;avTot+=x.aval.length;ok+=x.ok;no+=x.no;fe+=x.fe;ns+=x.ns;if(x.div)div++;
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
    ['Aprovadas como estão',ok,pct(ok,avTot)+' das avaliações'],
    ['Com ajustes',no,pct(no,avTot)+' · inclui as não aprovadas da 1ª rodada'],
    ['Fora do escopo',fe,pct(fe,avTot)+' das avaliações'],
    ['Não sei',ns,'a solução volta para o sorteio'],
    ['Com divergência',div,'soluções com pareceres diferentes'],
    ['Tempo médio',fmtTempo(media(tempos)),'por resposta']
  ];
  $('kpis').innerHTML=kpis.map(function(k){return '<div class="kpi"><span>'+k[0]+'</span><strong>'+(typeof k[1]==='number'?fmt(k[1]):esc(k[1]))+'</strong>'+(k[2]?'<small>'+esc(k[2])+'</small>':'')+'</div>';}).join('');

  renderGestores();
  renderSolucoes(st);
  renderForaDaBase();
  $('atualizado').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function renderGestores(){
  var rows=gestores.map(function(g){
    var av=g.avaliacoes||{},ids=Object.keys(av),lote=g.lote||[];
    var pend=lote.filter(function(id){return !av[id];}).length;
    var conta=function(d){return ids.filter(function(id){return av[id].decisao===d;}).length;};
    var ult=ids.map(function(id){return av[id].em;}).sort().pop();
    var tm=media(ids.map(function(id){return Number(av[id].tempoSegundos)||0;}));
    return {g:g,lote:lote.length,resp:ids.length,pend:pend,ok:conta('aprovada'),no:conta('ajustada')+conta('nao_aprovada'),fe:conta('fora_escopo'),ns:conta('nao_sei'),tm:tm,ult:ult};
  }).sort(function(a,b){return String(b.ult||'').localeCompare(String(a.ult||''));});
  $('gestores-vazio').hidden=rows.length>0;
  $('gestores').innerHTML=rows.map(function(r){
    return '<tr><td><b>'+esc(r.g.nome)+'</b><small>'+esc(r.g.email)+'</small></td>'+
      '<td class="num-col">'+r.lote+'</td><td class="num-col">'+r.resp+'</td><td class="num-col">'+r.pend+'</td>'+
      '<td class="num-col">'+r.ok+'</td><td class="num-col">'+r.no+'</td><td class="num-col">'+r.fe+'</td><td class="num-col">'+r.ns+'</td><td class="num-col">'+fmtTempo(r.tm)+'</td><td>'+fmtData(r.ult)+'</td>'+
      '<td><div class="row-actions">'+
        '<button type="button" class="btn-mini" data-liberar="'+esc(r.g.email)+'"'+(r.pend?'':' disabled')+' data-tip-align="end" data-tip="Devolve para a fila as soluções do lote desta pessoa que ainda estão sem resposta. As respostas dadas continuam.">Liberar pendentes</button>'+
        '<button type="button" class="btn-mini danger" data-remover="'+esc(r.g.email)+'" data-nome="'+esc(r.g.nome)+'" data-tip-align="end" data-tip="Move esta pessoa e todas as respostas dela para a lixeira. Dá para restaurar depois.">Remover</button>'+
      '</div></td></tr>';
  }).join('');rotular($('gestores').closest('table').parentNode);
}

var ICON_TEMPO='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/></svg>';
function tags(x){
  var h='';
  if(x.estado==='livre') h+='<span class="tag tag-livre">Sem ninguém</span>';
  if(x.res.length) h+='<span class="tag tag-res">'+x.res.length+' reservada'+(x.res.length>1?'s':'')+'</span>';
  if(x.ok) h+='<span class="tag tag-ok">'+x.ok+' aprovada'+(x.ok>1?'s':'')+'</span>';
  if(x.no) h+='<span class="tag tag-parcial">'+x.no+' com ajustes</span>';
  if(x.fe) h+='<span class="tag tag-no">'+x.fe+' fora do escopo</span>';
  if(x.ns) h+='<span class="tag tag-ns">'+x.ns+' não sei</span>';
  if(x.div) h+='<span class="tag tag-div">Divergência</span>';
  var t=x.aval.filter(function(v){return medido(v.a);}).map(function(v){return Number(v.a.tempoSegundos)||0;});
  if(t.length) h+='<span class="tag tag-tempo" title="Tempo gasto para responder'+(t.length>1?' (média de '+t.length+' respostas)':'')+'">'+ICON_TEMPO+(t.length>1?'média ':'')+esc(fmtTempo(t.reduce(function(a,b){return a+b;},0)/t.length)||'menos de 1 s').replace('—','menos de 1 s')+'</span>';
  return h;
}

/* ---------- análise das avaliações ---------- */
// Compara a classificação original da solução com a que o gestor deixou, filtro a filtro.
// Resultado: aprovada = acerto total; só adição = acerto parcial; qualquer remoção = erro;
// reclassificada sem mexer em filtro = "semmud" (fica fora do percentual); não sei = "ns";
// fora do escopo = "fora" (também fica fora do percentual).
// Opções que depois foram unificadas (pares espelho) contam como a opção nova.
function analisa(s,a){
  var r={cat:{},add:[],rem:[],n:0};
  if(a.decisao==='nao_sei'||a.decisao==='fora_escopo'){r.res=a.decisao==='nao_sei'?'ns':'fora';r.tipo='nenhuma';FILTERS.forEach(function(f){r.cat[f.key]='mantido';});return r;}
  FILTERS.forEach(function(f){
    var I=s.initial[f.key]||[],c=a.classificacao&&a.classificacao[f.key];
    var N=(reclassifica(a.decisao)&&Array.isArray(c)&&c.length)?unifica(c):I;
    var ad=N.filter(function(o){return I.indexOf(o)===-1;}),rm=I.filter(function(o){return N.indexOf(o)===-1;});
    r.cat[f.key]=ad.length&&rm.length?'ambos':ad.length?'add':rm.length?'rem':'mantido';
    ad.forEach(function(o){r.add.push(f.key+'|'+o);});rm.forEach(function(o){r.rem.push(f.key+'|'+o);});
  });
  var tA=r.add.length>0,tR=r.rem.length>0;r.n=r.add.length+r.rem.length;
  r.tipo=tA&&tR?'ambos':tA?'add':tR?'rem':'nenhuma';
  r.res=a.decisao==='aprovada'?'total':(tR?'erro':(tA?'parcial':'semmud'));
  return r;
}

var ROT={
  parecer:{aprovada:'Aprovada como está',ajustada:'Aprovada com ajustes',fora_escopo:'Fora do escopo',nao_aprovada:'Não aprovada (1ª rodada)',nao_sei:'Não sei'},
  resultado:{total:'Acerto total',parcial:'Acerto parcial (só adição)',erro:'Erro (houve remoção)',semmud:'Reclassificada sem mexer nos filtros',fora:'Fora do escopo'},
  tipo:{add:'Só adição',rem:'Só remoção',ambos:'Adição e remoção'},
  situacao:{livre:'Sem ninguém',reservada:'Reservada, sem resposta',validada:'Validada',nao:'Com ajustes',fora:'Com "fora do escopo"',ns:'Com "não sei"',div:'Com divergência'},
  origem:{Sebraetec:'Sebraetec',Sebrae:'Sebrae'}
};
var CAT_ROT={};FILTERS.forEach(function(f){CAT_ROT[f.key]=f.label;});
var F={gestor:{},parecer:{},resultado:{},tipo:{},categoria:{},add:{},rem:{},situacao:{},origem:{}};
var ordem='num';
var EVAL_KEYS=['gestor','parecer','resultado','tipo','categoria','add','rem'];
function sel(k){return Object.keys(F[k]).filter(function(v){return F[k][v];});}
function ativo(k){return sel(k).length>0;}
function nAtivos(){return Object.keys(F).reduce(function(n,k){return n+sel(k).length;},0);}
function temFiltroAval(){return EVAL_KEYS.some(ativo);}

function passaAval(v){
  var r=v.r;
  if(ativo('gestor')&&!F.gestor[v.g.email])return false;
  if(ativo('parecer')&&!F.parecer[v.a.decisao])return false;
  if(ativo('resultado')&&!F.resultado[r.res])return false;
  if(ativo('tipo')&&!F.tipo[r.tipo])return false;
  if(ativo('categoria')&&!sel('categoria').some(function(c){return r.cat[c]!=='mantido';}))return false;
  if(ativo('add')&&!r.add.some(function(k){return F.add[k];}))return false;
  if(ativo('rem')&&!r.rem.some(function(k){return F.rem[k];}))return false;
  return true;
}
function passaSol(s,x){
  if(ativo('origem')&&!F.origem[s.origem||'Sebrae'])return false;
  if(ativo('situacao')&&!sel('situacao').some(function(k){
    return k==='nao'?x.no>0:k==='fora'?x.fe>0:k==='ns'?x.ns>0:k==='div'?x.div:x.estado===k;}))return false;
  var q=busca.trim().toLowerCase();
  if(q&&s.nome.toLowerCase().indexOf(q)===-1&&s.num.indexOf(q.replace(/^0+/,''))===-1)return false;
  return true;
}

// Aplica os filtros: devolve as soluções visíveis, cada uma com as avaliações que passaram.
function filtrar(st){
  var lista=[];
  SOLUCOES.forEach(function(s){
    var x=st[s.id];if(!passaSol(s,x))return;
    var vs=x.aval.filter(passaAval);
    if(temFiltroAval()&&!vs.length)return;
    lista.push({s:s,x:x,vs:vs});
  });
  var cats=sel('categoria');
  function alteracoes(it){return it.vs.reduce(function(n,v){
    if(!cats.length)return n+v.r.n;
    return n+v.r.add.concat(v.r.rem).filter(function(k){return cats.indexOf(k.split('|')[0])!==-1;}).length;},0);}
  function cont(it,res){return it.vs.filter(function(v){return v.r.res===res;}).length;}
  function taxa(it){var t=cont(it,'total'),p=cont(it,'parcial'),e=cont(it,'erro'),d=t+p+e;return d?(t+p*0.5)/d:2;}
  var por={
    num:function(a,b){return Number(a.s.num)-Number(b.s.num);},
    alt:function(a,b){return alteracoes(b)-alteracoes(a)||Number(a.s.num)-Number(b.s.num);},
    erro:function(a,b){return cont(b,'erro')-cont(a,'erro')||alteracoes(b)-alteracoes(a);},
    assert:function(a,b){return taxa(a)-taxa(b)||Number(a.s.num)-Number(b.s.num);},
    aval:function(a,b){return b.vs.length-a.vs.length||Number(a.s.num)-Number(b.s.num);}
  };
  lista.sort(por[ordem]);
  lista.forEach(function(it){it.alt=alteracoes(it);});
  return lista;
}

/* ---------- render da análise ---------- */
function barra(partes){
  var tot=partes.reduce(function(n,p){return n+p[2];},0);
  return '<div class="meter meter-sm" role="img" aria-label="'+esc(partes.map(function(p){return p[1]+': '+p[2];}).join(', '))+'">'+
    (tot?partes.filter(function(p){return p[2]>0;}).map(function(p){return '<span class="'+p[0]+'" style="flex:'+p[2]+'" title="'+esc(p[1])+': '+p[2]+'"></span>';}).join(''):'<span class="seg-livre" style="flex:1"></span>')+'</div>';
}

function renderAssert(lista){
  var c={total:0,parcial:0,erro:0,semmud:0,ns:0,fora:0};
  lista.forEach(function(it){it.vs.forEach(function(v){c[v.r.res]++;});});
  var base=c.total+c.parcial+c.erro;
  var partes=[['seg-ok','Acerto total',c.total],['seg-parcial','Acerto parcial',c.parcial],['seg-erro','Erro',c.erro]];
  $('assert').innerHTML='<div class="assert-head"><span class="label">Assertividade da classificação</span>'+
    '<small>'+fmt(base)+' avaliações consideradas'+(nAtivos()?' com os filtros aplicados':'')+(c.semmud?' · '+c.semmud+' reclassificadas sem mexer nos filtros (fora do cálculo)':'')+(c.fora?' · '+c.fora+' "fora do escopo" (fora do cálculo)':'')+(c.ns?' · '+c.ns+' "não sei"':'')+'</small></div>'+
    barra(partes)+
    '<ul class="legend">'+partes.map(function(p){return '<li><i class="'+p[0]+'"></i>'+p[1]+' <b>'+pct(p[2],base)+'</b> <span class="muted">('+p[2]+')</span></li>';}).join('')+'</ul>';

  // filtro a filtro
  var h='';
  FILTERS.forEach(function(f){
    var k={mantido:0,add:0,rem:0,ambos:0},op={};
    lista.forEach(function(it){it.vs.forEach(function(v){
      if(v.r.res==='ns'||v.r.res==='semmud'||v.r.res==='fora')return;
      k[v.r.cat[f.key]]++;
      (it.s.initial[f.key]||[]).forEach(function(o){var x=op[o]=op[o]||{m:0,a:0,r:0};if(v.r.rem.indexOf(f.key+'|'+o)===-1)x.m++;});
      v.r.add.forEach(function(kk){if(kk.indexOf(f.key+'|')===0){var o=kk.slice(f.key.length+1);(op[o]=op[o]||{m:0,a:0,r:0}).a++;}});
      v.r.rem.forEach(function(kk){if(kk.indexOf(f.key+'|')===0){var o=kk.slice(f.key.length+1);(op[o]=op[o]||{m:0,a:0,r:0}).r++;}});
    });});
    var d=k.mantido+k.add+k.rem+k.ambos,rem=k.rem+k.ambos;
    var ops=Object.keys(op).sort(function(a,b){return (op[b].r+op[b].a)-(op[a].r+op[a].a)||op[b].m-op[a].m;});
    h+='<details class="pf-cat"><summary><b>'+esc(f.label)+'</b>'+barra([['seg-ok','Mantido',k.mantido],['seg-parcial','Só adição',k.add],['seg-erro','Com remoção',rem]])+
      '<span class="pf-num"><span class="ok">'+pct(k.mantido,d)+' mantido</span> · <span class="par">'+pct(k.add,d)+' só adição</span> · <span class="err">'+pct(rem,d)+' com remoção</span></span></summary>'+
      (ops.length?'<table class="tabela tabela-op"><thead><tr><th>Opção</th><th class="num-col">Mantida</th><th class="num-col">Adicionada</th><th class="num-col">Removida</th></tr></thead><tbody>'+
        ops.map(function(o){var x=op[o],key=esc(f.key+'|'+o);
          return '<tr><td>'+esc(o)+'</td><td class="num-col">'+x.m+'</td>'+
            '<td class="num-col">'+(x.a?'<button type="button" class="num-link" data-pick="add" data-key="'+key+'" data-tip-align="end" data-tip="Mostra as soluções em que esta opção foi adicionada.">'+x.a+'</button>':'0')+'</td>'+
            '<td class="num-col">'+(x.r?'<button type="button" class="num-link err" data-pick="rem" data-key="'+key+'" data-tip-align="end" data-tip="Mostra as soluções em que esta opção foi removida.">'+x.r+'</button>':'0')+'</td></tr>';}).join('')+
        '</tbody></table>':'<p class="empty">Sem avaliações para mostrar.</p>')+'</details>';
  });
  $('porfiltro').innerHTML=h;rotular($('porfiltro'));
}

function chipsAtivos(){
  var h='';
  Object.keys(F).forEach(function(k){sel(k).forEach(function(v){
    var t;
    if(k==='gestor'){var g=gestores.filter(function(x){return x.email===v;})[0];t='Gestor: '+(g?g.nome:v);}
    else if(k==='categoria')t='Mexeu em: '+CAT_ROT[v];
    else if(k==='add'||k==='rem'){var p=v.split('|');t=(k==='add'?'+ ':'− ')+p.slice(1).join('|')+' ('+CAT_ROT[p[0]]+')';}
    else t=(ROT[k]&&ROT[k][v])||v;
    h+='<button type="button" class="chip-ativo" data-tirar="'+esc(k)+'" data-valor="'+esc(v)+'" data-tip="Tira este filtro.">'+esc(t)+' <span aria-hidden="true">✕</span></button>';
  });});
  var n=nAtivos();
  $('filtros-ativos').hidden=!n;
  $('filtros-ativos').innerHTML=h+(n?'<button type="button" class="link-btn" id="limpar-ativos">Limpar tudo</button>':'');
  $('n-filtros').hidden=!n;$('n-filtros').textContent=n;
}

function difHtml(s,v){
  var h='';
  FILTERS.forEach(function(f){
    if(v.r.cat[f.key]==='mantido')return;
    var ad=v.r.add.filter(function(k){return k.indexOf(f.key+'|')===0;}).map(function(k){return k.slice(f.key.length+1);});
    var rm=v.r.rem.filter(function(k){return k.indexOf(f.key+'|')===0;}).map(function(k){return k.slice(f.key.length+1);});
    h+='<div class="dif"><strong>'+esc(f.label)+':</strong> '+rm.map(function(o){return '<span class="d-rem">− '+esc(o)+'</span>';}).join(' ')+' '+ad.map(function(o){return '<span class="d-add">+ '+esc(o)+'</span>';}).join(' ')+'</div>';
  });
  return h;
}
var RES_TAG={total:['tag-ok','Acerto total'],parcial:['tag-parcial','Acerto parcial'],erro:['tag-no','Erro'],semmud:['tag-ns','Sem mudança nos filtros']};
var PARECER_TAG={aprovada:['tag-ok','Aprovada como está'],ajustada:['tag-parcial','Aprovada com ajustes'],fora_escopo:['tag-no','Fora do escopo'],nao_aprovada:['tag-no','Não aprovada (1ª rodada)'],nao_sei:['tag-ns','Não sei']};

function detalhe(s,x,vs){
  var h='';
  if(!x.aval.length) h+='<p class="empty">Ninguém avaliou ainda.</p>';
  else if(vs.length<x.aval.length) h+='<p class="save-note">Mostrando '+vs.length+' de '+x.aval.length+' avaliações (filtros aplicados).</p>';
  vs.forEach(function(v){
    var a=v.a,okd=a.decisao==='aprovada';
    var tag=PARECER_TAG[a.decisao]||['tag-ns',a.decisao];
    var rt=RES_TAG[v.r.res];
    h+='<div class="aval"><div class="aval-head"><b>'+esc(v.g.nome)+'</b><span class="tag '+tag[0]+'">'+tag[1]+'</span>'+
      (rt&&!okd?'<span class="tag '+rt[0]+'">'+rt[1]+'</span>':'')+
      '<time>'+fmtData(a.em)+'</time><span class="tempo'+(medido(a)?'':' tempo-nm')+'">'+ICON_TEMPO+'Tempo: '+tempoTxt(a)+'</span></div>';
    if(reclassifica(a.decisao)) h+=difHtml(s,v)||'<div>Reclassificou sem alterar os filtros.</div>';
    if(a.decisao==='nao_sei') h+='<div><strong>Motivo:</strong> '+esc(motivoNs(a))+'</div>';
    if(a.importancia) h+='<div><strong>'+esc(IMPORTANCIA.label)+':</strong> '+esc(importanciaTxt(a.importancia))+'</div>';
    if(a.comentario) h+='<div><strong>Comentário:</strong> '+esc(a.comentario)+'</div>';
    h+='</div>';
  });
  if(x.res.length&&!temFiltroAval()) h+='<p class="save-note">No lote de: '+x.res.map(function(g){return esc(g.nome);}).join(', ')+' (sem resposta ainda)</p>';
  return h;
}

function renderSolucoes(st){
  st=st||consolidar();
  var lista=filtrar(st);
  chipsAtivos();
  renderAssert(lista);
  $('sol-contagem').textContent=lista.length+' de '+SOLUCOES.length+' soluções'+(nAtivos()||busca.trim()?' com os filtros aplicados':'');
  $('solucoes').innerHTML=lista.length?lista.map(function(it){
    var s=it.s,x=it.x;
    var extra=(ordem==='alt'||ativo('categoria'))&&it.alt?'<span class="tag tag-alt">'+it.alt+' alteraç'+(it.alt>1?'ões':'ão')+'</span>':'';
    return '<details class="sol" data-id="'+esc(s.id)+'"'+(abertas[s.id]?' open':'')+'><summary><span class="n-sol">Nº '+esc(s.num)+'</span><span class="nome">'+esc(s.nome)+' <span class="origem '+(s.origem==='Sebraetec'?'origem-st':'origem-sb')+'">'+esc(s.origem||'Sebrae')+'</span></span><span class="tags">'+extra+tags(x)+'</span></summary>'+
      '<div class="sol-body">'+detalhe(s,x,temFiltroAval()?it.vs:x.aval)+'</div></details>';
  }).join(''):'<p class="empty" style="padding:14px 4px">Nenhuma solução com esses filtros.</p>';
  if(!$('painel-filtros').hidden)renderPainelFiltros(st);
}

/* ---------- menu lateral de filtros ---------- */
function renderPainelFiltros(st){
  st=st||consolidar();
  var todas=[];SOLUCOES.forEach(function(s){st[s.id].aval.forEach(function(v){todas.push(v);});});
  function conta(fn){return todas.filter(fn).length;}
  function grupo(k,titulo,itens,abrir){
    var n=sel(k).length;
    return '<details class="fcat"'+(abrir||n?' open':'')+'><summary>'+esc(titulo)+(n?' <span class="badge">'+n+'</span>':'')+'</summary><div class="fopts">'+
      (itens.length?itens.map(function(i){return '<label class="fopt"><input type="checkbox" data-f="'+esc(k)+'" value="'+esc(i[0])+'"'+(F[k][i[0]]?' checked':'')+'><span>'+esc(i[1])+'</span><small>'+i[2]+'</small></label>';}).join(''):'<p class="empty">Nada para filtrar ainda.</p>')+'</div></details>';
  }
  var gs=gestores.filter(function(g){return Object.keys(g.avaliacoes||{}).length;}).sort(function(a,b){return a.nome.localeCompare(b.nome);});
  var h='';
  h+=grupo('gestor','Gestor',gs.map(function(g){return [g.email,g.nome,conta(function(v){return v.g.email===g.email;})];}).filter(function(i){return i[2]>0||F.gestor[i[0]];}));
  h+=grupo('parecer','Parecer',Object.keys(ROT.parecer).map(function(k){return [k,ROT.parecer[k],conta(function(v){return v.a.decisao===k;})];}));
  h+=grupo('resultado','Resultado (assertividade)',Object.keys(ROT.resultado).map(function(k){return [k,ROT.resultado[k],conta(function(v){return v.r.res===k;})];}));
  h+=grupo('tipo','Tipo de mudança',Object.keys(ROT.tipo).map(function(k){return [k,ROT.tipo[k],conta(function(v){return v.r.tipo===k;})];}));
  h+=grupo('categoria','Categoria de filtro mexida',FILTERS.map(function(f){return [f.key,f.label,conta(function(v){return v.r.cat[f.key]!=='mantido';})];}));
  ['add','rem'].forEach(function(k){
    var n=sel(k).length;
    h+='<details class="fcat"'+(n?' open':'')+'><summary>'+(k==='add'?'Opção adicionada':'Opção removida')+(n?' <span class="badge">'+n+'</span>':'')+'</summary><div class="fopts">';
    var algum=false;
    FILTERS.forEach(function(f){
      var cnt={};todas.forEach(function(v){v.r[k].forEach(function(kk){if(kk.indexOf(f.key+'|')===0)cnt[kk]=(cnt[kk]||0)+1;});});
      var ks=Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a];});
      if(!ks.length)return;algum=true;
      var m=ks.filter(function(x){return F[k][x];}).length;
      h+='<details class="fsub"'+(m?' open':'')+'><summary>'+esc(f.label)+' <small>'+ks.length+'</small></summary>'+
        ks.map(function(x){return '<label class="fopt"><input type="checkbox" data-f="'+k+'" value="'+esc(x)+'"'+(F[k][x]?' checked':'')+'><span>'+esc(x.slice(f.key.length+1))+'</span><small>'+cnt[x]+'</small></label>';}).join('')+'</details>';
    });
    if(!algum)h+='<p class="empty">Nenhuma opção '+(k==='add'?'adicionada':'removida')+' ainda.</p>';
    h+='</div></details>';
  });
  h+=grupo('situacao','Situação da solução',Object.keys(ROT.situacao).map(function(k){return [k,ROT.situacao[k],SOLUCOES.filter(function(s){var x=st[s.id];return k==='nao'?x.no>0:k==='fora'?x.fe>0:k==='ns'?x.ns>0:k==='div'?x.div:x.estado===k;}).length];}));
  h+=grupo('origem','Origem',['Sebraetec','Sebrae'].map(function(k){return [k,k,SOLUCOES.filter(function(s){return (s.origem||'Sebrae')===k;}).length];}));
  // mantém abertas as categorias que o usuário abriu
  var abertasF={};document.querySelectorAll('#pf-corpo details').forEach(function(d,i){abertasF[i]=d.open;});
  $('pf-corpo').innerHTML=h;
  document.querySelectorAll('#pf-corpo details').forEach(function(d,i){if(abertasF[i])d.open=true;});
}
function abrirFiltros(){
  renderPainelFiltros();
  $('painel-filtros').hidden=false;$('fundo-filtros').hidden=false;$('abrir-filtros').setAttribute('aria-expanded','true');
  $('painel-filtros').focus();
}
function fecharFiltros(){
  $('painel-filtros').hidden=true;$('fundo-filtros').hidden=true;$('abrir-filtros').setAttribute('aria-expanded','false');
  $('abrir-filtros').focus();
}
function limparFiltros(){Object.keys(F).forEach(function(k){F[k]={};});renderSolucoes();}

$('abrir-filtros').addEventListener('click',abrirFiltros);
$('fechar-filtros').addEventListener('click',fecharFiltros);
$('ver-filtros').addEventListener('click',fecharFiltros);
$('fundo-filtros').addEventListener('click',fecharFiltros);
$('limpar-filtros').addEventListener('click',limparFiltros);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('painel-filtros').hidden)fecharFiltros();});
$('pf-corpo').addEventListener('change',function(e){
  var t=e.target;if(!t.matches('input[data-f]'))return;
  F[t.getAttribute('data-f')][t.value]=t.checked;renderSolucoes();
});
$('ordem').addEventListener('change',function(e){ordem=e.target.value;renderSolucoes();});
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-tirar]');
  if(t){F[t.getAttribute('data-tirar')][t.getAttribute('data-valor')]=false;renderSolucoes();return;}
  if(e.target.closest('#limpar-ativos')){limparFiltros();return;}
  t=e.target.closest('[data-pick]');
  if(t){var k=t.getAttribute('data-pick');F[k][t.getAttribute('data-key')]=true;renderSolucoes();$('sol-contagem').scrollIntoView({behavior:'smooth',block:'start'});}
});

// Avaliações de soluções que saíram da base: não entram na cobertura nem na assertividade,
// mas continuam no CSV e aparecem aqui para ninguém achar que se perderam.
function renderForaDaBase(){
  var l=[];
  gestores.forEach(function(g){var av=g.avaliacoes||{};Object.keys(av).forEach(function(id){if(!porId[id])l.push({id:id,g:g,a:av[id]});});});
  l.sort(function(a,b){return Number(a.id.split('-')[1])-Number(b.id.split('-')[1])||String(a.a.em).localeCompare(String(b.a.em));});
  $('fora-base-box').hidden=!l.length;
  $('fora-base-n').textContent=l.length+' avaliaç'+(l.length===1?'ão':'ões');
  $('fora-base').innerHTML=l.map(function(x){
    var t=PARECER_TAG[x.a.decisao]||['tag-ns',x.a.decisao];
    return '<tr><td>Nº '+esc(x.id.split('-')[1])+'</td><td>'+esc(x.a.nomeSolucao||x.id)+'</td><td>'+esc(x.g.nome)+'</td><td><span class="tag '+t[0]+'">'+t[1]+'</span></td><td>'+esc(x.a.comentario||'')+'</td></tr>';
  }).join('');rotular($('fora-base').closest('table').parentNode);
}

function renderLixeira(){
  $('lixeira-vazia').hidden=lixeira.length>0;$('lixeira-wrap').hidden=!lixeira.length;
  $('lixeira').innerHTML=lixeira.map(function(x){
    return '<tr><td><b>'+esc(x.nome)+'</b><small>'+esc(x.email)+'</small></td><td class="num-col">'+x.respostas+'</td><td>'+fmtData(x.removidoEm)+'</td>'+
      '<td><div class="row-actions"><button type="button" class="btn-mini" data-restaurar="'+esc(x.id)+'" data-tip-align="end" data-tip="Devolve esta pessoa ao painel com todas as respostas. Se ela já entrou de novo, as respostas são juntadas.">Restaurar</button>'+
      '<button type="button" class="btn-mini danger" data-excluir="'+esc(x.id)+'" data-nome="'+esc(x.nome)+'" data-tip-align="end" data-tip="Apaga de vez esta pessoa e as respostas dela. Não pode ser desfeito.">Excluir definitivamente</button></div></td></tr>';
  }).join('');rotular($('lixeira').closest('table').parentNode);
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
  var t=e.target.closest('[data-liberar]');
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
