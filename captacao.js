// Módulo 7 — Matriz de Captação de Recursos
import { sb, h, q, limpar, erro, avisar, iniciarTela, abrirFormulario, fmtMoeda, fmtData, diasAte, etiqueta, vazio } from './lib.js';

const { ctx, main } = await iniciarTela('captacao.html', 'Matriz de captação de recursos',
  'Score de prontidão (0–100): metade pelos requisitos atendidos, metade pela folga de prazo. Prazo curto derruba o score para forçar ação.');
const gab = ctx.gab.id;
let ops = [];
const JANELA_DIAS = 60; // a partir de 60 dias de folga o prazo conta inteiro

// Requisitos atendidos (50) + folga de prazo (50, linear de 0 a 60 dias). Encerrado = 0.
function score(o, dias = diasAte(o.prazo_inscricao)) {
  const req = Array.isArray(o.requisitos) ? o.requisitos : [];
  const parteReq = req.length ? (req.filter((r) => r.atendido).length / req.length) * 50 : 0;
  if (dias !== null && dias < 0) return 0;
  const partePrazo = dias === null ? 25 : Math.min(dias, JANELA_DIAS) / JANELA_DIAS * 50;
  return Math.round(parteReq + partePrazo);
}
const cor = (s) => (s > 70 ? 'verde' : s >= 40 ? 'amarelo' : 'vermelho');

const area = h('div');
main.append(h('div', { class: 'acoes' },
  ctx.podeEscrever ? h('button', { class: 'btn primario', onclick: () => editar(null) }, '+ Nova oportunidade') : null), area);

async function carregar() {
  try {
    ops = await q(sb.from('oportunidades').select('*').eq('gabinete_id', gab).eq('arquivado', false));
    desenhar();
  } catch (e) { erro(e); }
}

function desenhar() {
  limpar(area);
  const urgentes = ops.filter((o) => { const d = diasAte(o.prazo_inscricao); return d !== null && d >= 0 && d < 7; });
  if (urgentes.length) {
    area.append(h('div', { class: 'aviso erro' }, h('strong', null, `Atenção: ${urgentes.length} edital(is) fecham em menos de 7 dias: `),
      urgentes.map((o) => `${o.nome} (${fmtData(o.prazo_inscricao)})`).join('; ')));
  }
  if (!ops.length) { area.append(vazio('Nenhuma oportunidade mapeada.')); return; }
  const ordenadas = [...ops].sort((a, b) => score(b) - score(a));
  area.append(h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ['Score', 'Edital / fonte', 'Financiador', 'Valor', 'Inscrição até', 'Requisitos', ''].map((t) => h('th', null, t)))),
    h('tbody', null, ordenadas.map((o) => {
      const s = score(o); const d = diasAte(o.prazo_inscricao);
      const req = o.requisitos || [];
      return h('tr', { class: d !== null && d >= 0 && d < 7 ? 'atrasado' : '' },
        h('td', null, etiqueta(String(s), cor(s))),
        h('td', null, o.link ? h('a', { href: o.link, target: '_blank', rel: 'noopener noreferrer' }, o.nome) : o.nome),
        h('td', null, o.orgao_financiador || '—'),
        h('td', { class: 'num' }, o.valor ? fmtMoeda(o.valor) : '—'),
        h('td', null, fmtData(o.prazo_inscricao), d === null ? '' : h('div', null, h('small', null, d < 0 ? 'encerrado' : `faltam ${d} dia(s)`))),
        h('td', null, `${req.filter((r) => r.atendido).length}/${req.length}`),
        h('td', null, h('button', { class: 'btn peq', onclick: () => editar(o) }, ctx.podeEscrever ? 'Editar' : 'Ver')));
    }))));
}

function editorRequisitos(lista) {
  const box = h('div', { class: 'lista-editavel' });
  const linha = (r = { texto: '', atendido: false }) => {
    const it = h('div', { class: 'item' },
      h('input', { type: 'checkbox', checked: r.atendido, 'aria-label': 'Atendido', style: { width: 'auto' }, disabled: !ctx.podeEscrever }),
      h('input', { type: 'text', value: r.texto, placeholder: 'Requisito (ex.: CNPJ ativo há 2 anos)', maxlength: 300, disabled: !ctx.podeEscrever }),
      ctx.podeEscrever ? h('button', { class: 'btn peq perigo', type: 'button', onclick: () => it.remove() }, '×') : null);
    box.insertBefore(it, botao);
  };
  const botao = h('button', { class: 'btn peq', type: 'button', onclick: () => linha() }, '+ requisito');
  box.append(botao);
  (lista.length ? lista : [{ texto: '', atendido: false }]).forEach(linha);
  if (!ctx.podeEscrever) botao.remove();
  const ler = () => [...box.querySelectorAll('.item')].map((it) => {
    const [c, t] = it.querySelectorAll('input');
    return { texto: t.value.trim(), atendido: c.checked };
  }).filter((r) => r.texto);
  return { box, ler };
}

function editar(o) {
  const req = editorRequisitos(o?.requisitos || []);
  abrirFormulario({
    titulo: o ? o.nome : 'Nova oportunidade',
    somenteLeitura: !ctx.podeEscrever,
    valores: o || {},
    campos: [
      { nome: 'nome', rotulo: 'Nome do edital / fonte', obrigatorio: true },
      { nome: 'orgao_financiador', rotulo: 'Órgão financiador', largura: 'meia' },
      { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', largura: 'meia' },
      { nome: 'prazo_inscricao', rotulo: 'Prazo de inscrição', tipo: 'data', largura: 'meia' },
      { nome: 'link', rotulo: 'Link do edital', tipo: 'url', largura: 'meia' },
      ...(o ? [{ nome: 'arquivado', rotulo: 'Arquivar', tipo: 'checkbox' }] : []),
    ],
    extra: h('div', null, h('label', { class: 'campo' }, 'Requisitos de elegibilidade (marque os atendidos)'), req.box),
    aoSalvar: async (v) => {
      const reg = { ...v, requisitos: req.ler() };
      if (o) await q(sb.from('oportunidades').update(reg).eq('id', o.id));
      else await q(sb.from('oportunidades').insert({ ...reg, gabinete_id: gab }));
      avisar('Oportunidade salva.'); await carregar();
    },
  });
}

await carregar();
