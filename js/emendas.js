// Módulo 2 — Triador de Emendas Parlamentares
import { sb, h, q, limpar, erro, avisar, iniciarTela, abrirFormulario, fmtMoeda, etiqueta, vazio } from './lib.js';
import { ITENS_CHECKLIST } from './constantes.js';
const COR = { 'Elegível': 'verde', Pendente: 'amarelo', Inabilitada: 'vermelho' };

const { ctx, main } = await iniciarTela('emendas.html', 'Triador de emendas',
  'O sistema sinaliza a situação da documentação. A validação final é sempre humana.');
const gab = ctx.gab.id;
let emendas = [];
let filtroStatus = '';

const resumo = h('div', { class: 'grade-cartoes' });
const tabela = h('div');
main.append(h('div', { class: 'acoes' },
  ctx.podeEscrever ? h('button', { class: 'btn primario', onclick: () => editar(null) }, '+ Nova emenda') : null,
  h('div', { class: 'filtros dir' }, h('select', { 'aria-label': 'Situação', onchange: (e) => { filtroStatus = e.target.value; desenhar(); } },
    h('option', { value: '' }, 'Todas as situações'), ['Elegível', 'Pendente', 'Inabilitada'].map((s) => h('option', { value: s }, s))))),
resumo, tabela);

async function carregar() {
  try {
    emendas = await q(sb.from('emendas').select('*').eq('gabinete_id', gab).eq('arquivado', false).order('criado_em', { ascending: false }));
    desenhar();
  } catch (e) { erro(e); }
}

function desenhar() {
  limpar(resumo); limpar(tabela);
  for (const s of ['Elegível', 'Pendente', 'Inabilitada']) {
    const l = emendas.filter((e) => e.status === s);
    resumo.append(h('div', { class: 'cartao indicador' }, h('div', { class: 'valor' }, l.length),
      h('div', { class: 'rot' }, `${s} · ${fmtMoeda(l.reduce((t, e) => t + Number(e.valor), 0))}`)));
  }
  const l = emendas.filter((e) => !filtroStatus || e.status === filtroStatus);
  if (!l.length) { tabela.append(vazio('Nenhuma emenda nesta situação.')); return; }
  tabela.append(h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ['Número', 'Objeto', 'Valor', 'Órgão destino', 'Checklist', 'Situação', ''].map((t) => h('th', null, t)))),
    h('tbody', null, l.map((e) => {
      const ok = ITENS_CHECKLIST.filter(([k]) => e.checklist?.[k] === 'sim').length;
      return h('tr', null,
        h('td', null, e.numero), h('td', null, e.objeto), h('td', { class: 'num' }, fmtMoeda(e.valor)),
        h('td', null, e.orgao_destino || '—'), h('td', null, `${ok}/4`),
        h('td', null, etiqueta(e.status, COR[e.status])),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('button', { class: 'btn peq', onclick: () => editar(e) }, ctx.podeEscrever ? 'Editar' : 'Ver'), ' ',
          h('a', { class: 'btn peq', href: `documento.html?tipo=checklist_emenda&origem=emendas&id=${e.id}` }, 'Checklist PDF')));
    }))));
}

function editar(e) {
  const valores = e ? { ...e, ...Object.fromEntries(ITENS_CHECKLIST.map(([k]) => [`ck_${k}`, e.checklist?.[k] || null])) } : {};
  abrirFormulario({
    titulo: e ? `Emenda ${e.numero}` : 'Nova emenda',
    somenteLeitura: !ctx.podeEscrever,
    valores,
    campos: [
      { nome: 'numero', rotulo: 'Número da emenda', obrigatorio: true, max: 60, largura: 'meia' },
      { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true, largura: 'meia' },
      { nome: 'objeto', rotulo: 'Objeto', tipo: 'textarea', obrigatorio: true, max: 1000, linhas: 3 },
      { nome: 'orgao_destino', rotulo: 'Órgão de destino', largura: 'meia' },
      { nome: 'autor', rotulo: 'Autor (parlamentar)', largura: 'meia' },
      ...ITENS_CHECKLIST.map(([k, r]) => ({ nome: `ck_${k}`, rotulo: r, tipo: 'simnao' })),
      { nome: 'observacoes', rotulo: 'Observações da análise', tipo: 'textarea', max: 2000 },
      ...(e ? [{ nome: 'arquivado', rotulo: 'Arquivar esta emenda', tipo: 'checkbox' }] : []),
    ],
    aoSalvar: async (v) => {
      const checklist = {};
      for (const [k] of ITENS_CHECKLIST) { if (v[`ck_${k}`]) checklist[k] = v[`ck_${k}`]; delete v[`ck_${k}`]; }
      const reg = { ...v, checklist };
      if (e) await q(sb.from('emendas').update(reg).eq('id', e.id));
      else await q(sb.from('emendas').insert({ ...reg, gabinete_id: gab }));
      avisar('Emenda salva. A situação foi recalculada.'); await carregar();
    },
  });
}

await carregar();
