// Módulo 8 — Monitor de Proposições e Fiscalização
import { sb, h, q, limpar, erro, avisar, iniciarTela, abrirFormulario, historico, fmtData, diasAte, etiqueta, vazio } from './lib.js';

const TIPOS = ['PL', 'PLC', 'PDL', 'PEC', 'Requerimento', 'Pedido de Informação', 'Indicação', 'Outro'];
const FLUXO = ['Apresentado', 'Em Análise', 'Em Pauta', 'Aprovado', 'Rejeitado', 'Respondido', 'Arquivado'];
const ENCERRADOS = ['Respondido', 'Aprovado', 'Rejeitado', 'Arquivado'];
const COR = { Apresentado: 'azul', 'Em Análise': 'amarelo', 'Em Pauta': 'amarelo', Aprovado: 'verde', Rejeitado: 'vermelho', Respondido: 'verde', Arquivado: '' };

const { ctx, main } = await iniciarTela('proposicoes.html', 'Proposições e fiscalização',
  'Acompanhe o trâmite e os prazos de resposta. Vencido o prazo sem resposta, a situação passa a "Cobrar resposta".');
const gab = ctx.gab.id;
let props = [];
let filtro = '';

// Situação exibida: "Cobrar resposta" quando o prazo venceu e ainda não houve resposta/decisão
const vencida = (p) => p.prazo_final && !ENCERRADOS.includes(p.status) && diasAte(p.prazo_final) < 0;
const situacao = (p) => (vencida(p) ? 'Cobrar resposta' : p.status);

const painel = h('div', { class: 'grade-cartoes' });
const area = h('div');
main.append(h('div', { class: 'acoes' },
  ctx.podeEscrever ? h('button', { class: 'btn primario', onclick: () => editar(null) }, '+ Nova proposição / pedido') : null,
  h('div', { class: 'filtros dir' }, h('select', { 'aria-label': 'Situação', onchange: (e) => { filtro = e.target.value; desenhar(); } },
    h('option', { value: '' }, 'Todas as situações'), ['Cobrar resposta', ...FLUXO].map((s) => h('option', { value: s }, s))))),
painel, area);

async function carregar() {
  try {
    props = await q(sb.from('proposicoes').select('*').eq('gabinete_id', gab).order('data_apresentacao', { ascending: false }));
    desenhar();
  } catch (e) { erro(e); }
}

function desenhar() {
  limpar(painel); limpar(area);
  const ativos = props.filter((p) => !p.arquivado);
  const respondidos = ativos.filter((p) => ENCERRADOS.includes(p.status)).length;
  const venc = ativos.filter(vencida).length;
  const ind = (v, r, cor) => h('div', { class: `cartao indicador ${cor || ''}` }, h('div', { class: 'valor' }, v), h('div', { class: 'rot' }, r));
  painel.append(ind(ativos.length, 'total de pedidos e proposições'), ind(respondidos, 'respondidos / decididos', 'verde'),
    ind(ativos.length - respondidos - venc, 'pendentes no prazo'), ind(venc, 'vencidos — cobrar resposta', venc ? 'vermelho' : ''));
  const l = ativos.filter((p) => !filtro || situacao(p) === filtro);
  if (!l.length) { area.append(vazio('Nada nesta situação.')); return; }
  area.append(h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ['Número', 'Tipo', 'Ementa', 'Órgão', 'Apresentado', 'Prazo final', 'Situação', ''].map((t) => h('th', null, t)))),
    h('tbody', null, l.map((p) => {
      const s = situacao(p);
      return h('tr', { class: vencida(p) ? 'atrasado' : '' },
        h('td', null, p.numero), h('td', null, p.tipo), h('td', null, p.ementa), h('td', null, p.orgao_destino || '—'),
        h('td', null, fmtData(p.data_apresentacao)), h('td', null, fmtData(p.prazo_final)),
        h('td', null, etiqueta(s, s === 'Cobrar resposta' ? 'vermelho' : COR[s])),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('button', { class: 'btn peq', onclick: () => editar(p) }, ctx.podeEscrever ? 'Editar' : 'Ver'), ' ',
          vencida(p) && ctx.podeEscrever ? h('a', { class: 'btn peq verde', href: `documento.html?tipo=oficio_cobranca&origem=proposicoes&id=${p.id}` }, 'Ofício de cobrança') : null));
    }))));
}

function editar(p) {
  const hist = h('div');
  if (p) {
    hist.append(h('h3', { style: { marginTop: '12px' } }, 'Tramitação'));
    historico(p.id, (a, b) => (a && b && a.status !== b.status ? `${a.status} → ${b.status}` : null))
      .then((lista) => hist.append(lista)).catch(() => hist.append(h('p', { class: 'sub' }, 'Histórico disponível para administradores e assessores.')));
  }
  abrirFormulario({
    titulo: p ? `${p.tipo} ${p.numero}` : 'Nova proposição ou pedido', somenteLeitura: !ctx.podeEscrever,
    valores: p || { tipo: 'Pedido de Informação', status: 'Apresentado' },
    campos: [
      { nome: 'numero', rotulo: 'Número', obrigatorio: true, max: 60, largura: 'meia' },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: TIPOS.map((t) => [t, t]), largura: 'meia' },
      { nome: 'ementa', rotulo: 'Ementa', tipo: 'textarea', obrigatorio: true, max: 2000, linhas: 3 },
      { nome: 'orgao_destino', rotulo: 'Órgão destinatário', largura: 'meia' },
      { nome: 'data_apresentacao', rotulo: 'Data de apresentação', tipo: 'data', obrigatorio: true, largura: 'meia' },
      { nome: 'prazo_dias', rotulo: 'Prazo regimental (dias)', tipo: 'numero', min: 0, passo: 1, largura: 'meia', ajuda: 'prazo final é calculado' },
      { nome: 'status', rotulo: 'Situação no trâmite', tipo: 'select', opcoes: FLUXO.map((t) => [t, t]), largura: 'meia' },
      { nome: 'respondido_em', rotulo: 'Respondido em', tipo: 'data' },
      ...(p ? [{ nome: 'arquivado', rotulo: 'Arquivar', tipo: 'checkbox' }] : []),
    ],
    extra: hist,
    aoSalvar: async (v) => {
      if (p) await q(sb.from('proposicoes').update(v).eq('id', p.id));
      else await q(sb.from('proposicoes').insert({ ...v, gabinete_id: gab }));
      avisar('Registro salvo.'); await carregar();
    },
  });
}

await carregar();
