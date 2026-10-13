/* =====================================================================
   FILTROS — Validação de Soluções
   - FILTERS: filtros e opções possíveis (modo de reclassificação)
   - LEVELS: definições dos níveis de maturidade (tooltip)
   - UNIFICAR: opções antigas que viraram uma só (pares espelho); vale para a planilha
     (scripts/gerar_data.py) e para avaliações gravadas antes da unificação
   As soluções ficam em data.js, gerado da planilha por scripts/gerar_data.py.
   ===================================================================== */
var NA='Não se aplica (institucional)';
var FILTERS=[
  {key:'segmento',label:'Segmento',options:['Alimentos e Bebidas','Construção Civil','Madeira e Móveis','Metal Mecânica','Têxtil e Vestuário','Multi segmento','Setorial','Fora do escopo']},
  {key:'jornada',label:'Jornada',options:['Administrativa','Produção',NA]},
  {key:'area',label:'Área principal',options:['Automação e Digitalização','Comercial','Compliance e Obrigações da Empresa','Custos Industriais da Produção','ESG','Engenharia de Processos','Gestão Estratégica','Gestão Financeira e Controladoria','Gestão de Negócios','Gestão de Operações','Gestão de Pessoas','Inovação','Logística Interna e Materiais','Marketing','PCP e Planejamento da Produção','Qualidade Industrial',NA]},
  {key:'maturidade',label:'Maturidade empresarial',options:['Nível 1','Nível 2','Nível 3','Nível 4','Nível 5',NA]},
  {key:'momento',label:'Momento empresarial',options:['Para Quem Quer Ganhar Mercado','Para Quem Quer Ganhar Competitividade','Para Quem Quer Inovar e Digitalizar','Para Quem Quer ESG','Não se aplica (solução institucional)']}
];
var UNIFICAR={"Automação e Digitalização Industrial": "Automação e Digitalização", "ESG Operacional e Segurança": "ESG", "Gestão de Operações — Gerencial": "Gestão de Operações", "Inovação aplicada à produção": "Inovação"};
// Troca as opções antigas pelas unificadas, sem repetir.
function unifica(lista){var r=[];(lista||[]).forEach(function(o){o=UNIFICAR[o]||o;if(r.indexOf(o)===-1)r.push(o);});return r;}
var LEVELS={
  'Nível 1':{title:'Nível 1 · Empresa Formal Inicial',range:'até R$ 500 mil/ano',text:'Empresa recém formalizada, ainda buscando sobreviver e conseguir viver do negócio. A gestão é reativa e centralizada no empresário, sem controles financeiros estruturados, e a produção é artesanal ou improvisada, sem indicadores de desempenho. Os principais riscos são mortalidade do negócio, preço mal calculado, baixa qualidade e dependência total do operador.',signal:'ainda mistura dinheiro pessoal e da empresa na mesma conta.'},
  'Nível 2':{title:'Nível 2 · Empresa Estruturada Inicial',range:'R$ 500 mil a R$ 1,5 mi/ano',text:'Empresa que já parou de apagar incêndio e busca ganhar controle sobre a operação. Aparecem os primeiros controles financeiros e de estoque, com melhorias iniciais de layout e qualidade no chão de fábrica, ainda sem leitura clara de custos. O risco principal é crescer sem estrutura adequada, gerando sobrecarga, gargalos produtivos e perda de controle financeiro.',signal:'já separa PF e PJ, mas ainda não sabe o custo real de cada produto.'},
  'Nível 3':{title:'Nível 3 · Empresa em Consolidação Operacional',range:'R$ 1,5 mi a R$ 3 mi/ano',text:'Empresa buscando crescer sem perder dinheiro, transformando organização em produtividade. A gestão passa a usar DRE gerencial e dados para decisão, enquanto a produção implanta PCP simples, balanceamento de linha e primeiros indicadores. O risco é a margem ser corroída pelo crescimento, com decisões ainda muito baseadas em percepção.',signal:'já tem DRE gerencial e sabe a margem por produto.'},
  'Nível 4':{title:'Nível 4 · Empresa Competitiva Estruturada',range:'R$ 3 mi a R$ 6 mi/ano',text:'Empresa focada em converter produtividade em lucro e ganhar liderança de mercado com o que já produz. A gestão estrutura custos industriais, precificação técnica e capital de giro, enquanto a produção já mede eficiência, controla refugo e tem rastreabilidade básica. Os riscos são margens comprimidas e complexidade crescente sem liderança intermediária nem governança suficiente.',signal:'já faz orçamento anual e calcula ponto de equilíbrio.'},
  'Nível 5':{title:'Nível 5 · Empresa em Escala e Profissionalização',range:'R$ 6 mi a R$ 10 mi/ano',text:'Empresa buscando escalar sem perder o controle, com foco em crescimento estruturado, tecnologia e mercado. A gestão avança para governança corporativa, crédito estruturado e compliance financeiro, enquanto a produção digitaliza apontamentos, integra PCP e se prepara para certificações. Os riscos são perda de controle na escala, dependência de poucos clientes e investimentos mal dimensionados.',signal:'já acessa crédito estruturado e analisa investimento com métricas financeiras como VPL ou TIR.'}
};

/* Textos de ajuda dos filtros (tooltip): '_titulo' vai no nome do filtro; as demais chaves são as opções.
   Os níveis de maturidade usam LEVELS acima. */
var FILTER_TIPS={
 "segmento": {
  "Alimentos e Bebidas": "Soluções voltadas a indústrias de alimentos e bebidas, como boas práticas de fabricação, rotulagem, segurança dos alimentos e exigências sanitárias.",
  "Construção Civil": "Soluções específicas para construtoras e indústrias de materiais de construção, como gestão de obra, normas técnicas e desempenho de edificações.",
  "Madeira e Móveis": "Soluções específicas para a cadeia de madeira e móveis, como design de mobiliário, aproveitamento de matéria-prima e certificação florestal.",
  "Metal Mecânica": "Soluções específicas para metalurgia, usinagem, caldeiraria e fabricação de máquinas e componentes.",
  "Têxtil e Vestuário": "Soluções específicas para confecção, moda e têxteis, como modelagem, coleção, etiquetagem e cadeia de fornecimento.",
  "Multi segmento": "A solução serve a mais de um setor industrial sem adaptação relevante. A maior parte da base está aqui, então este filtro sozinho restringe pouco.",
  "Setorial": "A solução é específica de um setor, mas de um setor diferente dos cinco segmentos prioritários.",
  "Fora do escopo": "Nenhum dos cinco segmentos industriais tem aderência à solução. Em geral são soluções voltadas a comércio, serviços ou ao público em geral."
 },
 "jornada": {
  "_titulo": "Em qual lado da empresa a solução atua: na gestão ou no chão de fábrica.",
  "Administrativa": "Atua na gestão do negócio: estratégia, finanças, pessoas, vendas, marketing, obrigações legais e ESG corporativo.",
  "Produção": "Atua no chão de fábrica: processos produtivos, qualidade, planejamento da produção, automação industrial, logística interna e segurança operacional.",
  "Não se aplica (institucional)": "Programas, editais ou iniciativas do Sebrae que não se encaixam em uma jornada específica."
 },
 "area": {
  "_titulo": "Principal área da empresa que a solução desenvolve, conforme a matriz de maturidade.",
  "Automação e Digitalização": "Digitalização da gestão e do chão de fábrica: sistemas de gestão (ERP), ferramentas digitais, dados, automação de rotinas, máquinas conectadas, sensores e tecnologias da Indústria 4.0.",
  "Comercial": "Vendas e relacionamento com clientes: processo comercial, prospecção, negociação, precificação e canais de venda.",
  "Compliance e Obrigações da Empresa": "Cumprimento de exigências legais, fiscais, trabalhistas, sanitárias e regulatórias, incluindo licenças, alvarás e registros.",
  "Custos Industriais da Produção": "Apuração e controle do custo de fabricação: custo por produto, rateios, perdas e formação de preço a partir da produção.",
  "ESG": "Sustentabilidade na gestão e na fábrica: governança, práticas ambientais e sociais, relatórios ESG, normas regulamentadoras (NR), saúde e segurança do trabalho, resíduos e impacto ambiental da operação.",
  "Engenharia de Processos": "Desenho e melhoria dos processos produtivos: fluxo, layout, métodos, tempos e redução de desperdícios.",
  "Gestão Estratégica": "Direção da empresa: planejamento estratégico, metas, indicadores, governança e modelos de excelência em gestão.",
  "Gestão Financeira e Controladoria": "Finanças do negócio: fluxo de caixa, controles financeiros, custos gerenciais, crédito e análise de resultados.",
  "Gestão de Negócios": "Fundamentos do negócio: modelo de negócio, estruturação da empresa, formalização e visão geral de gestão.",
  "Gestão de Operações": "Rotina operacional da empresa, no escritório e na fábrica: organização do trabalho, fluxos e processos, produtividade, padronização e gestão visual.",
  "Gestão de Pessoas": "Pessoas na gestão: recrutamento, liderança, cultura, remuneração, desenvolvimento de equipes e clima organizacional.",
  "Inovação": "Inovação no negócio e na produção: novos produtos, serviços, processos e modelos de negócio, prototipagem, propriedade intelectual e acesso a ecossistemas de inovação.",
  "Logística Interna e Materiais": "Fluxo de materiais dentro da empresa: estoques, almoxarifado, armazenagem, movimentação e abastecimento da produção.",
  "Marketing": "Posicionamento e comunicação: marca, identidade visual, marketing digital, pesquisa de mercado e embalagem.",
  "PCP e Planejamento da Produção": "Planejamento e controle da produção: programação, sequenciamento, capacidade produtiva e cumprimento de prazos.",
  "Qualidade Industrial": "Qualidade do produto e do processo: controle de qualidade, normas técnicas, adequação a requisitos e certificações.",
  "Não se aplica (institucional)": "Programas, editais ou iniciativas do Sebrae que não se concentram em uma área específica da empresa."
 },
 "maturidade": {
  "Não se aplica (institucional)": "Programas ou iniciativas abertos a empresas de qualquer porte, sem uma etapa de maturidade definida."
 },
 "momento": {
  "_titulo": "O principal objetivo da empresa que a solução ajuda a alcançar agora.",
  "Para Quem Quer Ganhar Mercado": "Para empresas que querem vender mais, conquistar clientes, entrar em novos mercados ou canais, inclusive exportação e compras públicas.",
  "Para Quem Quer Ganhar Competitividade": "Para empresas que querem produzir melhor e com menor custo: gestão, processos, qualidade, produtividade e controle financeiro.",
  "Para Quem Quer Inovar e Digitalizar": "Para empresas que querem adotar novas tecnologias, digitalizar processos ou desenvolver produtos e modelos de negócio inovadores.",
  "Para Quem Quer ESG": "Para empresas que querem incorporar práticas ambientais, sociais e de governança, atender exigências de clientes ou se preparar para certificações.",
  "Não se aplica (solução institucional)": "Programas ou iniciativas do Sebrae que não se ligam a um momento empresarial específico."
 }
};
