// Administração do gabinete: identidade visual, membros, trilha de auditoria e exportação
import { sb, h, q, limpar, erro, avisar, iniciarTela, abrirFormulario, fmtData, etiqueta, baixar, paraCSV, hojeISO, parar } from './lib.js';

const { ctx, main } = await iniciarTela('admin.html', 'Administração do gabinete', 'Disponível apenas para administradores do gabinete.');
const gab = ctx.gab.id;
if (!ctx.ehAdmin) {
  main.append(h('div', { class: 'aviso erro' }, 'Seu perfil não é de administrador neste gabinete.'));
  await parar();
}
const PAPEIS = [['admin', 'Administrador'], ['assessor', 'Assessor (lê e grava)'], ['leitura', 'Somente leitura']];
let aba = 'membros';
const abas = h('div', { class: 'abas' });
const area = h('div');
main.append(abas, area);
const ABAS = [['membros', 'Membros'], ['identidade', 'Identidade e assinatura'], ['trilha', 'Trilha de auditoria'], ['exportar', 'Exportar dados']];
function desenharAbas() {
  limpar(abas).append(...ABAS.map(([k, r]) => h('button', { class: aba === k ? 'ativo' : '', onclick: () => { aba = k; desenharAbas(); desenhar(); } }, r)));
}
function desenhar() {
  limpar(area);
  ({ membros, identidade, trilha, exportar })[aba]().catch(erro);
}

async function membros() {
  const ms = await q(sb.from('membros').select('*').eq('gabinete_id', gab).order('ativo', { ascending: false }).order('email'));
  area.append(h('div', { class: 'acoes' }, h('button', { class: 'btn primario', onclick: () => editarMembro(null) }, '+ Liberar acesso'),
    h('span', { class: 'sub', style: { margin: 0 } }, 'A pessoa entra com a conta Google deste e-mail.')),
  h('table', { class: 'tabela' }, h('thead', null, h('tr', null, ['E-mail', 'Nome', 'Perfil', 'Situação', 'Desde', ''].map((t) => h('th', null, t)))),
    h('tbody', null, ms.map((m) => h('tr', null, h('td', null, m.email), h('td', null, m.nome || '—'),
      h('td', null, PAPEIS.find((p) => p[0] === m.papel)[1]), h('td', null, m.ativo ? etiqueta('ativo', 'verde') : etiqueta('desligado', '')),
      h('td', null, fmtData(m.criado_em)), h('td', null, h('button', { class: 'btn peq', onclick: () => editarMembro(m) }, 'Editar')))))));
}
function editarMembro(m) {
  abrirFormulario({
    titulo: m ? m.email : 'Liberar acesso', valores: m || { papel: 'assessor', ativo: true },
    campos: [
      { nome: 'email', rotulo: 'E-mail Google', tipo: 'email', obrigatorio: true, desativado: !!m },
      { nome: 'nome', rotulo: 'Nome (aparece como responsável nas demandas)' },
      { nome: 'papel', rotulo: 'Perfil', tipo: 'select', opcoes: PAPEIS },
      { nome: 'ativo', rotulo: 'Acesso ativo (desmarque para desligar imediatamente)', tipo: 'checkbox' },
    ],
    aoSalvar: async (v) => {
      if (m) await q(sb.from('membros').update({ nome: v.nome, papel: v.papel, ativo: v.ativo }).eq('id', m.id));
      else await q(sb.from('membros').insert({ gabinete_id: gab, email: v.email.toLowerCase(), nome: v.nome, papel: v.papel, ativo: v.ativo }));
      avisar('Acesso atualizado.'); desenhar();
    },
  });
}

async function identidade() {
  const [g] = await q(sb.from('gabinetes').select('*').eq('id', gab));
  const campos = [
    { nome: 'nome', rotulo: 'Nome do gabinete', obrigatorio: true },
    { nome: 'parlamentar', rotulo: 'Parlamentar', largura: 'meia' },
    { nome: 'casa_legislativa', rotulo: 'Casa legislativa', largura: 'meia' },
    { nome: 'cabecalho', rotulo: 'Cabeçalho dos documentos', tipo: 'linhas', ajuda: 'uma linha por linha impressa' },
    { nome: 'brasao_url', rotulo: 'Endereço do brasão (imagem https://)', tipo: 'url' },
    { nome: 'assinatura_nome', rotulo: 'Nome de quem assina', largura: 'meia' },
    { nome: 'assinatura_cargo', rotulo: 'Cargo de quem assina', largura: 'meia' },
  ];
  area.append(h('div', { class: 'cartao' },
    h('p', null, h('strong', null, 'Sigla: '), g.sigla, ' · ', h('strong', null, 'Plano: '), g.plano, ' · ', h('strong', null, 'Situação: '), g.situacao),
    h('p', { class: 'sub' }, 'Sigla, plano e situação são definidos pela administração da plataforma.'),
    h('button', { class: 'btn primario', onclick: () => abrirFormulario({
      titulo: 'Identidade do gabinete', valores: g, campos,
      aoSalvar: async (v) => { await q(sb.from('gabinetes').update(v).eq('id', gab)); avisar('Identidade salva. Recarregue para ver no topo.'); desenhar(); },
    }) }, 'Editar identidade'),
    h('h3', { style: { marginTop: '16px' } }, 'Prévia do cabeçalho'),
    h('div', { class: 'folha', style: { padding: '20px' } }, h('div', { class: 'cab' },
      g.brasao_url ? h('img', { src: g.brasao_url, alt: '' }) : null, (g.cabecalho.length ? g.cabecalho : [g.nome]).map((l) => h('p', null, l)), h('hr')))));
}

async function trilha() {
  const tabelaSel = h('select', null, h('option', { value: '' }, 'Todas as tabelas'),
    ['demandas', 'okr_objetivos', 'okr_krs', 'okr_lancamentos', 'emendas', 'projetos', 'pautas', 'oportunidades', 'proposicoes', 'documentos', 'membros', 'gabinetes']
      .map((t) => h('option', { value: t }, t)));
  const lista = h('div');
  const integ = h('div');
  const carregarTrilha = async () => {
    limpar(lista);
    let c = sb.from('auditoria').select('id, tabela, registro_id, acao, usuario, em').eq('gabinete_id', gab).order('id', { ascending: false }).limit(300);
    if (tabelaSel.value) c = c.eq('tabela', tabelaSel.value);
    const ls = await q(c);
    lista.append(h('table', { class: 'tabela' }, h('thead', null, h('tr', null, ['#', 'Quando', 'Quem', 'Tabela', 'Ação', 'Registro'].map((t) => h('th', null, t)))),
      h('tbody', null, ls.map((l) => h('tr', null, h('td', null, l.id), h('td', null, fmtData(l.em)), h('td', null, l.usuario), h('td', null, l.tabela),
        h('td', null, { INSERT: 'criou', UPDATE: 'alterou', DELETE: 'apagou' }[l.acao]), h('td', null, h('small', null, l.registro_id)))))));
  };
  tabelaSel.addEventListener('change', () => carregarTrilha().catch(erro));
  area.append(h('div', { class: 'acoes' }, tabelaSel,
    h('button', { class: 'btn', onclick: async () => {
      limpar(integ);
      try {
        const [r] = await q(sb.rpc('verificar_cadeia', { p_gab: gab }));
        integ.append(h('div', { class: `aviso ${r.integra ? 'ok' : 'erro'}` }, r.integra
          ? `Trilha íntegra: ${r.total} registros conferidos, nenhuma alteração fora do sistema.`
          : `ATENÇÃO: a trilha foi alterada fora do sistema a partir do registro #${r.primeiro_erro}. Comunique a administração da plataforma.`));
      } catch (e) { erro(e); }
    } }, 'Conferir integridade (hash encadeado)')), integ, lista);
  await carregarTrilha();
}

const TABELAS_EXPORT = ['demandas', 'okr_objetivos', 'okr_krs', 'okr_lancamentos', 'emendas', 'projetos', 'pautas', 'oportunidades', 'proposicoes', 'documentos', 'membros', 'auditoria'];
async function buscarTudo(tabela) {
  const todos = []; const passo = 1000;
  for (let i = 0; ; i += passo) {
    const lote = await q(sb.from(tabela).select('*').eq('gabinete_id', gab).range(i, i + passo - 1));
    todos.push(...lote);
    if (lote.length < passo) return todos;
  }
}
async function exportar() {
  const status = h('div');
  area.append(h('div', { class: 'cartao' },
    h('p', null, 'Baixe todos os dados do gabinete. Use para backup próprio ou ao encerrar o contrato — o gabinete é o dono dos dados.'),
    h('div', { class: 'acoes' },
      h('button', { class: 'btn primario', onclick: async () => {
        limpar(status).append(h('p', { class: 'sub' }, 'Exportando…'));
        try {
          const pacote = { gabinete: ctx.gab, exportado_em: new Date().toISOString(), exportado_por: ctx.email, tabelas: {} };
          for (const t of TABELAS_EXPORT) pacote.tabelas[t] = await buscarTudo(t);
          baixar(`gabinete-${ctx.gab.sigla}-${hojeISO()}.json`, JSON.stringify(pacote, null, 2));
          limpar(status).append(h('div', { class: 'aviso ok' }, 'Arquivo JSON gerado.'));
        } catch (e) { erro(e); limpar(status); }
      } }, 'Exportar tudo (JSON)'),
      h('select', { id: 'tabCsv' }, TABELAS_EXPORT.map((t) => h('option', { value: t }, t))),
      h('button', { class: 'btn', onclick: async () => {
        const t = document.getElementById('tabCsv').value;
        try { baixar(`${ctx.gab.sigla}-${t}-${hojeISO()}.csv`, paraCSV(await buscarTudo(t)), 'text/csv;charset=utf-8'); } catch (e) { erro(e); }
      } }, 'Baixar tabela em CSV')),
    h('p', { class: 'sub' }, 'Os arquivos contêm dados pessoais de cidadãos: guarde-os em local protegido.'), status));
}

desenharAbas();
desenhar();
