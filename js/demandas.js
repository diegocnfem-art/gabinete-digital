// Módulo 3 — Gestor de Demandas e Kanban
import { sb, h, q, limpar, erro, avisar, iniciarTela, abrirFormulario, abrirJanela, historico,
  membrosDoGabinete, fmtData, diasAte, etiqueta, vazio } from './lib.js';
import { LIMITE_EM_ANDAMENTO } from '../config.js';

const COLUNAS = [
  ['a_fazer', 'A Fazer'],
  ['em_andamento', 'Em Andamento'],
  ['concluido', 'Concluído'],
  ['arquivado', 'Arquivado'],
];
const ROT_STATUS = Object.fromEntries(COLUNAS);
const PRIORIDADES = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];
const ROT_PRIO = Object.fromEntries(PRIORIDADES);

const { ctx, main } = await iniciarTela('demandas.html', 'Demandas do gabinete',
  'Registre cada pedido com responsável e prazo. Arraste os cartões entre as colunas ou use os botões.');
const gab = ctx.gab.id;
let demandas = [];
let responsaveis = [];
const filtro = { prioridade: '', responsavel: '', busca: '', arquivadas: false };

const quadro = h('div');
const barra = h('div', { class: 'acoes' },
  ctx.podeEscrever ? h('button', { class: 'btn primario', onclick: () => editar(null) }, '+ Nova demanda') : null,
  h('div', { class: 'filtros dir' },
    h('input', { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar', oninput: (e) => { filtro.busca = e.target.value.toLowerCase(); desenhar(); } }),
    h('select', { 'aria-label': 'Prioridade', onchange: (e) => { filtro.prioridade = e.target.value; desenhar(); } },
      h('option', { value: '' }, 'Todas as prioridades'), PRIORIDADES.map(([v, r]) => h('option', { value: v }, r))),
    h('select', { id: 'filtroResp', 'aria-label': 'Responsável', onchange: (e) => { filtro.responsavel = e.target.value; desenhar(); } },
      h('option', { value: '' }, 'Todos os responsáveis')),
    h('label', { class: 'linha-check' }, h('input', { type: 'checkbox', onchange: (e) => { filtro.arquivadas = e.target.checked; desenhar(); } }), 'Mostrar arquivadas')));
main.append(barra, h('p', { class: 'sub so-celular' }, 'No celular, deslize para o lado para ver as colunas e use o botão “→” para mover a demanda.'), quadro);

async function carregar() {
  try {
    [demandas, responsaveis] = await Promise.all([
      q(sb.from('demandas').select('*').eq('gabinete_id', gab).order('prazo', { ascending: true, nullsFirst: false })),
      membrosDoGabinete(gab),
    ]);
    const sel = document.getElementById('filtroResp');
    const nomes = [...new Set([...responsaveis.map((r) => r[0]), ...demandas.map((d) => d.responsavel).filter(Boolean)])];
    limpar(sel).append(h('option', { value: '' }, 'Todos os responsáveis'), ...nomes.map((n) => h('option', { value: n }, n)));
    desenhar();
  } catch (e) { erro(e); }
}

function atrasada(d) {
  return d.prazo && ['a_fazer', 'em_andamento'].includes(d.status) && diasAte(d.prazo) < 0;
}

function desenhar() {
  limpar(quadro);
  const visiveis = demandas.filter((d) =>
    (!filtro.prioridade || d.prioridade === filtro.prioridade) &&
    (!filtro.responsavel || d.responsavel === filtro.responsavel) &&
    (!filtro.busca || `${d.solicitante} ${d.descricao} ${d.contato || ''}`.toLowerCase().includes(filtro.busca)));
  const cols = COLUNAS.filter(([s]) => filtro.arquivadas || s !== 'arquivado');
  const kanban = h('div', { class: `kanban ${filtro.arquivadas ? '' : 'sem-arquivo'}` });
  for (const [status, rotulo] of cols) {
    const itens = visiveis.filter((d) => d.status === status);
    const excesso = status === 'em_andamento' && itens.length > LIMITE_EM_ANDAMENTO;
    const col = h('section', { class: 'coluna', dataset: { status }, 'aria-label': rotulo },
      h('div', { class: 'coluna-topo' }, h('span', null, `${rotulo} (${itens.length})`),
        excesso ? h('span', { class: 'limite', title: 'Limite de trabalho em andamento' }, `acima do limite de ${LIMITE_EM_ANDAMENTO}`) : null),
      itens.length ? itens.map(cartao) : h('p', { class: 'sub', style: { fontSize: '.8rem' } }, 'Nenhuma demanda.'));
    if (ctx.podeEscrever) {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('alvo'); });
      col.addEventListener('dragleave', () => col.classList.remove('alvo'));
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('alvo');
        const id = e.dataTransfer.getData('text/plain');
        mover(id, status);
      });
    }
    kanban.append(col);
  }
  quadro.append(kanban);
  if (!demandas.length) quadro.prepend(vazio('Nenhuma demanda cadastrada ainda.'));
}

function cartao(d) {
  const idx = COLUNAS.findIndex(([s]) => s === d.status);
  const prox = COLUNAS[idx + 1];
  const dias = diasAte(d.prazo);
  const el = h('article', {
    class: `card p-${d.prioridade} ${atrasada(d) ? 'atrasado' : ''}`, draggable: ctx.podeEscrever ? 'true' : null,
    tabindex: '0', 'aria-label': `Demanda de ${d.solicitante}`,
  },
  h('h4', null, d.solicitante),
  h('p', null, d.descricao.length > 120 ? `${d.descricao.slice(0, 120)}…` : d.descricao),
  h('div', { class: 'meta' },
    etiqueta(ROT_PRIO[d.prioridade], d.prioridade === 'alta' ? 'vermelho' : d.prioridade === 'media' ? 'amarelo' : 'verde'),
    d.prazo ? h('span', { class: atrasada(d) ? 'etiqueta vermelho' : '' },
      atrasada(d) ? `venceu ${fmtData(d.prazo)}` : `prazo ${fmtData(d.prazo)}${dias !== null && dias <= 3 && dias >= 0 ? ' (próximo)' : ''}`) : null,
    d.responsavel ? h('span', null, `· ${d.responsavel}`) : null,
    d.dado_sensivel ? etiqueta('sensível', 'azul') : null),
  h('div', { class: 'botoes' },
    h('button', { class: 'btn peq', onclick: () => editar(d) }, ctx.podeEscrever ? 'Abrir' : 'Ver'),
    ctx.podeEscrever && prox ? h('button', { class: 'btn peq', onclick: () => mover(d.id, prox[0]) }, `→ ${prox[1]}`) : null,
    d.status === 'concluido' && ctx.podeEscrever
      ? h('a', { class: 'btn peq verde', href: `documento.html?tipo=oficio_resposta&origem=demandas&id=${d.id}` }, 'Gerar ofício') : null));
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dblclick', () => editar(d));
  return el;
}

async function mover(id, status) {
  const d = demandas.find((x) => x.id === id);
  if (!d || d.status === status) return;
  try {
    const [nova] = await q(sb.from('demandas').update({ status, arquivado: status === 'arquivado' }).eq('id', id).select());
    Object.assign(d, nova);
    desenhar();
    avisar(`Demanda movida para "${ROT_STATUS[status]}".`, 'ok', 2500);
  } catch (e) { erro(e); }
}

function editar(d) {
  const hist = h('div');
  if (d) {
    hist.append(h('h3', { style: { marginTop: '12px' } }, 'Histórico'), h('p', { class: 'sub' }, 'Carregando…'));
    historico(d.id, (a, b) => (a && b && a.status !== b.status ? `${ROT_STATUS[a.status]} → ${ROT_STATUS[b.status]}` : null))
      .then((lista) => { hist.lastChild.replaceWith(lista); })
      .catch(() => { hist.lastChild.textContent = 'Histórico disponível para administradores e assessores.'; });
  }
  const opcoesResp = [['', '— sem responsável —'], ...responsaveis];
  if (d && d.responsavel && !responsaveis.some((r) => r[0] === d.responsavel)) opcoesResp.push([d.responsavel, d.responsavel]);
  abrirFormulario({
    titulo: d ? 'Demanda' : 'Nova demanda',
    somenteLeitura: !ctx.podeEscrever,
    valores: d || { prioridade: 'media' },
    campos: [
      { nome: 'solicitante', rotulo: 'Cidadão ou órgão solicitante', obrigatorio: true, max: 200 },
      { nome: 'contato', rotulo: 'Contato', ajuda: 'telefone ou e-mail — só o necessário', max: 200 },
      { nome: 'descricao', rotulo: 'Descrição da demanda', tipo: 'textarea', obrigatorio: true, max: 3000 },
      { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIORIDADES, largura: 'meia' },
      { nome: 'prazo', rotulo: 'Prazo', tipo: 'data', largura: 'meia' },
      { nome: 'responsavel', rotulo: 'Responsável', tipo: 'select', opcoes: opcoesResp, largura: 'meia' },
      { nome: 'status', rotulo: 'Situação', tipo: 'select', opcoes: COLUNAS, largura: 'meia' },
      { nome: 'resposta', rotulo: 'Encaminhamento / resposta ao cidadão', tipo: 'textarea', max: 5000, ajuda: 'usado no ofício de resposta' },
      { nome: 'dado_sensivel', rotulo: 'Contém dado sensível (saúde, situação pessoal) — oculta do perfil leitura', tipo: 'checkbox' },
    ],
    extra: hist,
    aoSalvar: async (v) => {
      v.arquivado = v.status === 'arquivado';
      if (d) {
        const [nova] = await q(sb.from('demandas').update(v).eq('id', d.id).select());
        Object.assign(d, nova);
      } else {
        const [nova] = await q(sb.from('demandas').insert({ ...v, gabinete_id: gab, status: v.status || 'a_fazer' }).select());
        demandas.push(nova);
      }
      avisar('Demanda salva.');
      desenhar();
    },
  });
}

await carregar();
if (new URLSearchParams(location.search).get('nova') && ctx.podeEscrever) editar(null);
