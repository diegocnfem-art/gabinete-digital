// Módulo 1 — Painel de OKRs do Mandato
import { sb, h, q, limpar, erro, avisar, iniciarTela, abrirFormulario, abrirJanela, fmtData, diasAte, pct,
  etiqueta, vazio } from './lib.js';

const { ctx, main } = await iniciarTela('okrs.html', 'OKRs do mandato',
  'Objetivos e resultados-chave (até 5 por objetivo). O progresso é calculado a partir dos lançamentos.');
const gab = ctx.gab.id;
let objetivos = [];
let krs = [];

const resumo = h('div');
const lista = h('div');
main.append(h('div', { class: 'acoes' },
  ctx.podeEscrever ? h('button', { class: 'btn primario', onclick: () => editarObjetivo(null) }, '+ Novo objetivo') : null,
  h('a', { class: 'btn dir', href: 'documento.html?tipo=relatorio_okr' }, 'Gerar relatório de acompanhamento')), resumo, lista);

// Alerta: prazo em menos de 15 dias e progresso abaixo de 50% (ou prazo vencido sem atingir a meta)
function emRisco(k) {
  const d = diasAte(k.prazo);
  const p = pct(k.atual, k.meta);
  return d !== null && ((d <= 15 && p < 50) || (d < 0 && p < 100));
}

async function carregar() {
  try {
    [objetivos, krs] = await Promise.all([
      q(sb.from('okr_objetivos').select('*').eq('gabinete_id', gab).eq('arquivado', false).order('criado_em')),
      q(sb.from('okr_krs').select('*').eq('gabinete_id', gab).eq('arquivado', false).order('criado_em')),
    ]);
    desenhar();
  } catch (e) { erro(e); }
}

function anel(valor) {
  const el = h('div', { class: 'anel' }, h('div', null, `${valor}%`));
  el.style.background = `conic-gradient(var(--azul) ${valor * 3.6}deg, var(--cinza-100) 0)`;
  return el;
}

function desenhar() {
  limpar(resumo); limpar(lista);
  if (!objetivos.length) { lista.append(vazio('Cadastre o primeiro objetivo do mandato.')); return; }
  const progObj = (o) => {
    const ks = krs.filter((k) => k.objetivo_id === o.id);
    return ks.length ? Math.round(ks.reduce((s, k) => s + pct(k.atual, k.meta), 0) / ks.length) : 0;
  };
  const geral = Math.round(objetivos.reduce((s, o) => s + progObj(o), 0) / objetivos.length);
  const risco = krs.filter(emRisco).length;
  resumo.append(h('div', { class: 'grade-cartoes' },
    h('div', { class: 'cartao', style: { display: 'flex', gap: '16px', alignItems: 'center', gridColumn: 'span 2' } }, anel(geral),
      h('div', null, h('strong', null, 'Progresso geral do mandato'), h('div', { class: 'sub', style: { margin: 0 } }, `${objetivos.length} objetivos · ${krs.length} resultados-chave`))),
    h('div', { class: `cartao indicador ${risco ? 'vermelho' : 'verde'}` }, h('div', { class: 'valor' }, risco), h('div', { class: 'rot' }, 'KRs em risco (prazo < 15 dias e progresso < 50%)'))));

  for (const o of objetivos) {
    const ks = krs.filter((k) => k.objetivo_id === o.id);
    const p = progObj(o);
    lista.append(h('section', { class: 'cartao', style: { marginBottom: '14px' } },
      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
        h('h3', { style: { margin: 0 } }, o.titulo), o.ciclo ? etiqueta(o.ciclo, 'azul') : null,
        h('strong', { style: { marginLeft: 'auto' } }, `${p}%`),
        ctx.podeEscrever ? h('button', { class: 'btn peq', onclick: () => editarObjetivo(o) }, 'Editar') : null,
        ctx.podeEscrever && ks.length < 5 ? h('button', { class: 'btn peq', onclick: () => editarKR(null, o) }, '+ KR') : null),
      o.descricao ? h('p', { class: 'sub', style: { margin: '4px 0 8px' } }, o.descricao) : null,
      h('div', { class: `barra ${p >= 100 ? 'verde' : ''}`, style: { margin: '8px 0 14px' } }, barraSpan(p)),
      ks.length ? h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Resultado-chave', 'Meta', 'Atual', 'Progresso', 'Prazo', ''].map((t) => h('th', null, t)))),
        h('tbody', null, ks.map((k) => {
          const pk = pct(k.atual, k.meta);
          const r = emRisco(k);
          return h('tr', { class: r ? 'atrasado' : '' },
            h('td', null, k.descricao, r ? h('div', null, etiqueta('em risco', 'vermelho')) : null),
            h('td', { class: 'num' }, `${Number(k.meta).toLocaleString('pt-BR')} ${k.unidade || ''}`),
            h('td', { class: 'num' }, Number(k.atual).toLocaleString('pt-BR')),
            h('td', { style: { minWidth: '140px' } }, h('div', { class: `barra ${r ? 'vermelho' : pk >= 100 ? 'verde' : ''}` }, barraSpan(pk)), h('small', null, `${pk}%`)),
            h('td', null, fmtData(k.prazo)),
            h('td', { style: { whiteSpace: 'nowrap' } },
              ctx.podeEscrever ? h('button', { class: 'btn peq primario', onclick: () => lancar(k) }, 'Lançar') : null, ' ',
              h('button', { class: 'btn peq', onclick: () => verLancamentos(k) }, 'Histórico'), ' ',
              ctx.podeEscrever ? h('button', { class: 'btn peq', onclick: () => editarKR(k, o) }, 'Editar') : null));
        }))) : h('p', { class: 'sub' }, 'Nenhum resultado-chave ainda.')));
  }
}
function barraSpan(p) { const s = h('span'); s.style.width = `${p}%`; return s; }

function editarObjetivo(o) {
  abrirFormulario({
    titulo: o ? 'Editar objetivo' : 'Novo objetivo',
    valores: o || {},
    campos: [
      { nome: 'titulo', rotulo: 'Objetivo', obrigatorio: true, ajuda: 'ex.: Melhorar a comunicação com a comunidade' },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', max: 2000 },
      { nome: 'ciclo', rotulo: 'Ciclo', ajuda: 'ex.: 2027-T1', max: 60 },
      ...(o ? [{ nome: 'arquivado', rotulo: 'Arquivar este objetivo', tipo: 'checkbox' }] : []),
    ],
    aoSalvar: async (v) => {
      if (o) await q(sb.from('okr_objetivos').update(v).eq('id', o.id));
      else await q(sb.from('okr_objetivos').insert({ ...v, gabinete_id: gab }));
      avisar('Objetivo salvo.'); await carregar();
    },
  });
}

function editarKR(k, o) {
  abrirFormulario({
    titulo: k ? 'Editar resultado-chave' : `Novo resultado-chave — ${o.titulo}`,
    valores: k || {},
    campos: [
      { nome: 'descricao', rotulo: 'Resultado-chave', obrigatorio: true, ajuda: 'ex.: Realizar 12 visitas aos bairros' },
      { nome: 'meta', rotulo: 'Meta', tipo: 'numero', obrigatorio: true, min: 0, largura: 'meia' },
      { nome: 'unidade', rotulo: 'Unidade', ajuda: 'ex.: visitas', max: 40, largura: 'meia' },
      { nome: 'prazo', rotulo: 'Prazo', tipo: 'data' },
      ...(k ? [{ nome: 'arquivado', rotulo: 'Arquivar este resultado-chave', tipo: 'checkbox' }] : []),
    ],
    aoSalvar: async (v) => {
      if (k) await q(sb.from('okr_krs').update(v).eq('id', k.id));
      else await q(sb.from('okr_krs').insert({ ...v, gabinete_id: gab, objetivo_id: o.id }));
      avisar('Resultado-chave salvo.'); await carregar();
    },
  });
}

function lancar(k) {
  abrirFormulario({
    titulo: `Lançar progresso — ${k.descricao}`,
    valores: { valor: k.atual },
    campos: [
      { nome: 'valor', rotulo: `Valor atual acumulado (${k.unidade || 'unidades'})`, tipo: 'numero', obrigatorio: true, min: 0 },
      { nome: 'observacao', rotulo: 'Observação / fonte de verificação', max: 500 },
    ],
    rotuloSalvar: 'Lançar',
    aoSalvar: async (v) => {
      await q(sb.from('okr_lancamentos').insert({ ...v, gabinete_id: gab, kr_id: k.id }));
      avisar('Progresso lançado.'); await carregar();
    },
  });
}

async function verLancamentos(k) {
  try {
    const l = await q(sb.from('okr_lancamentos').select('*').eq('kr_id', k.id).order('criado_em', { ascending: false }).limit(50));
    abrirJanela(`Lançamentos — ${k.descricao}`, l.length
      ? h('ul', { class: 'historico' }, l.map((x) => h('li', null, h('strong', null, `${Number(x.valor).toLocaleString('pt-BR')} ${k.unidade || ''}`),
        x.observacao ? ` — ${x.observacao}` : '', h('br'), h('small', null, `${fmtData(x.criado_em)} · ${x.criado_por}`))))
      : h('p', { class: 'sub' }, 'Nenhum lançamento ainda.'));
  } catch (e) { erro(e); }
}

await carregar();
