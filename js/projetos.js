// Módulo 4 — Gerador de Projetos e Planos de Trabalho (formulário guiado em etapas)
import { sb, h, q, limpar, erro, avisar, iniciarTela, fmtData, etiqueta, vazio } from './lib.js';

const { ctx, main } = await iniciarTela('projetos.html', 'Projetos e planos de trabalho',
  'Formulário guiado: problema → objetivos → metas → cronograma. Ao final, gere o plano de trabalho formatado.');
const gab = ctx.gab.id;
const area = h('div');
main.append(area);
const STATUS = { rascunho: ['Rascunho', ''], pronto: ['Pronto', 'verde'], protocolado: ['Protocolado', 'azul'] };

async function listar() {
  limpar(area);
  try {
    const ps = await q(sb.from('projetos').select('id, titulo, status, atualizado_em, objetivo_geral').eq('gabinete_id', gab)
      .eq('arquivado', false).order('atualizado_em', { ascending: false }));
    area.append(h('div', { class: 'acoes' }, ctx.podeEscrever ? h('button', { class: 'btn primario', onclick: () => assistente(null) }, '+ Novo projeto') : null));
    if (!ps.length) { area.append(vazio('Nenhum projeto ainda.')); return; }
    area.append(h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Projeto', 'Objetivo geral', 'Situação', 'Atualizado', ''].map((t) => h('th', null, t)))),
      h('tbody', null, ps.map((p) => h('tr', null,
        h('td', null, h('strong', null, p.titulo)), h('td', null, p.objetivo_geral || '—'),
        h('td', null, etiqueta(STATUS[p.status][0], STATUS[p.status][1])), h('td', null, fmtData(p.atualizado_em)),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('button', { class: 'btn peq', onclick: () => abrir(p.id) }, ctx.podeEscrever ? 'Editar' : 'Ver'), ' ',
          h('a', { class: 'btn peq', href: `documento.html?tipo=plano_trabalho&origem=projetos&id=${p.id}` }, 'Plano de trabalho')))))));
  } catch (e) { erro(e); }
}

async function abrir(id) {
  try {
    const [p] = await q(sb.from('projetos').select('*').eq('id', id));
    assistente(p);
  } catch (e) { erro(e); }
}

// Tabela editável simples: colunas [{chave, rotulo, tipo}]
function tabelaEditavel(colunas, linhas, minimo = 1) {
  const corpo = h('tbody');
  const addLinha = (l = {}) => {
    const tr = h('tr', null, colunas.map((c) => h('td', null, h('input', {
      type: c.tipo || 'text', value: l[c.chave] ?? '', 'aria-label': c.rotulo, disabled: !ctx.podeEscrever, style: { margin: 0 },
    }))), h('td', null, ctx.podeEscrever ? h('button', { class: 'btn peq perigo', type: 'button', onclick: () => tr.remove() }, '×') : null));
    corpo.append(tr);
  };
  (linhas.length ? linhas : Array.from({ length: minimo }, () => ({}))).forEach(addLinha);
  const el = h('div', null, h('table', { class: 'tabela' }, h('thead', null, h('tr', null, colunas.map((c) => h('th', null, c.rotulo)), h('th'))), corpo),
    ctx.podeEscrever ? h('button', { class: 'btn peq', type: 'button', style: { marginTop: '6px' }, onclick: () => addLinha() }, '+ linha') : null);
  const ler = () => [...corpo.querySelectorAll('tr')].map((tr) => {
    const ins = tr.querySelectorAll('input');
    const o = {}; colunas.forEach((c, i) => { o[c.chave] = ins[i].value.trim(); });
    return o;
  }).filter((o) => Object.values(o).some(Boolean));
  return { el, ler };
}

function assistente(p) {
  const dados = p ? structuredClone(p) : { titulo: '', problema: '', justificativa: '', objetivo_geral: '', objetivos_especificos: [], metas: [], cronograma: [], status: 'rascunho' };
  const ETAPAS = ['Problema', 'Objetivos', 'Metas e indicadores', 'Cronograma', 'Revisão'];
  let etapa = 0;
  let leitor = () => {};

  const campoTexto = (rot, chave, tipo = 'input', ajuda) => {
    const el = tipo === 'textarea' ? h('textarea', { rows: 5, disabled: !ctx.podeEscrever }) : h('input', { type: 'text', disabled: !ctx.podeEscrever });
    el.value = dados[chave] || '';
    return { el: h('label', { class: 'campo' }, rot, ' *', ajuda ? h('small', null, ` — ${ajuda}`) : null, el), ler: () => { dados[chave] = el.value.trim(); } };
  };

  const validar = () => {
    const faltas = [];
    if (etapa === 0) { if (!dados.titulo) faltas.push('título'); if (!dados.problema) faltas.push('problema'); if (!dados.justificativa) faltas.push('justificativa'); }
    if (etapa === 1) {
      if (!dados.objetivo_geral) faltas.push('objetivo geral');
      const n = dados.objetivos_especificos.length;
      if (n < 3 || n > 5) faltas.push('de 3 a 5 objetivos específicos');
    }
    if (etapa === 2 && !dados.metas.some((m) => m.meta && m.indicador)) faltas.push('ao menos uma meta com indicador');
    if (etapa === 3) {
      if (!dados.cronograma.some((c) => c.atividade && c.inicio && c.fim)) faltas.push('ao menos uma atividade com início e fim');
      if (dados.cronograma.some((c) => c.inicio && c.fim && c.fim < c.inicio)) faltas.push('datas de fim posteriores ao início');
    }
    return faltas;
  };

  const desenharEtapa = () => {
    limpar(area);
    const caixa = h('div', { class: 'cartao' });
    area.append(h('div', { class: 'acoes' }, h('button', { class: 'btn', onclick: listar }, '← Voltar à lista'),
      h('strong', null, dados.titulo || 'Novo projeto')),
    h('div', { class: 'etapas' }, ETAPAS.map((e, i) => h('span', { class: i === etapa ? 'ativa' : i < etapa ? 'feita' : '' }, `${i + 1}. ${e}`))), caixa);

    if (etapa === 0) {
      const a = campoTexto('Título do projeto', 'titulo');
      const b = campoTexto('Problema', 'problema', 'textarea', 'qual situação o projeto pretende mudar, com dados');
      const c = campoTexto('Justificativa', 'justificativa', 'textarea', 'por que agir agora e por que esta solução');
      caixa.append(a.el, b.el, c.el); leitor = () => { a.ler(); b.ler(); c.ler(); };
    } else if (etapa === 1) {
      const a = campoTexto('Objetivo geral', 'objetivo_geral');
      const esp = h('textarea', { rows: 5, placeholder: 'Um objetivo por linha (de 3 a 5)', disabled: !ctx.podeEscrever });
      esp.value = dados.objetivos_especificos.join('\n');
      caixa.append(a.el, h('label', { class: 'campo' }, 'Objetivos específicos *', h('small', null, ' — de 3 a 5, um por linha'), esp));
      leitor = () => { a.ler(); dados.objetivos_especificos = esp.value.split('\n').map((s) => s.trim()).filter(Boolean); };
    } else if (etapa === 2) {
      const t = tabelaEditavel([{ chave: 'meta', rotulo: 'Meta' }, { chave: 'quantidade', rotulo: 'Quantidade' }, { chave: 'indicador', rotulo: 'Indicador' }, { chave: 'fonte', rotulo: 'Fonte de verificação' }], dados.metas, 2);
      caixa.append(h('p', { class: 'sub' }, 'Metas quantitativas, com o indicador que vai medi-las e onde a informação será verificada.'), t.el);
      leitor = () => { dados.metas = t.ler(); };
    } else if (etapa === 3) {
      const t = tabelaEditavel([{ chave: 'atividade', rotulo: 'Atividade' }, { chave: 'responsavel', rotulo: 'Responsável' }, { chave: 'inicio', rotulo: 'Início', tipo: 'date' }, { chave: 'fim', rotulo: 'Fim', tipo: 'date' }], dados.cronograma, 3);
      caixa.append(t.el); leitor = () => { dados.cronograma = t.ler(); };
    } else {
      leitor = () => {};
      const st = h('select', { disabled: !ctx.podeEscrever }, Object.entries(STATUS).map(([v, [r]]) => h('option', { value: v, selected: dados.status === v }, r)));
      st.addEventListener('change', () => { dados.status = st.value; });
      caixa.append(
        h('h3', null, dados.titulo), h('p', null, h('strong', null, 'Objetivo geral: '), dados.objetivo_geral),
        h('ul', null, dados.objetivos_especificos.map((o) => h('li', null, o))),
        h('p', null, `${dados.metas.length} meta(s) · ${dados.cronograma.length} atividade(s) no cronograma`),
        h('label', { class: 'campo' }, 'Situação do projeto', st));
    }

    const msg = h('div');
    const anterior = h('button', { class: 'btn', disabled: etapa === 0, onclick: () => { leitor(); etapa--; desenharEtapa(); } }, '← Anterior');
    const proxima = etapa < ETAPAS.length - 1
      ? h('button', { class: 'btn primario', onclick: () => {
        leitor(); const f = validar();
        if (f.length) { limpar(msg).append(h('div', { class: 'aviso erro' }, `Para avançar, preencha: ${f.join(', ')}.`)); return; }
        etapa++; desenharEtapa();
      } }, 'Próxima →') : null;
    const salvar = ctx.podeEscrever ? h('button', { class: `btn ${etapa === ETAPAS.length - 1 ? 'verde' : ''}`, onclick: async () => {
      leitor();
      if (!dados.titulo) { limpar(msg).append(h('div', { class: 'aviso erro' }, 'Informe ao menos o título para salvar.')); return; }
      await gravar(dados);
    } }, etapa === ETAPAS.length - 1 ? 'Salvar projeto' : 'Salvar rascunho') : null;
    caixa.append(msg, h('div', { class: 'acoes', style: { marginTop: '16px' } }, anterior, proxima, h('span', { class: 'dir' }), salvar,
      dados.id && etapa === ETAPAS.length - 1 ? h('a', { class: 'btn primario', href: `documento.html?tipo=plano_trabalho&origem=projetos&id=${dados.id}` }, 'Gerar plano de trabalho') : null));
  };

  const gravar = async (d) => {
    const reg = { titulo: d.titulo, problema: d.problema, justificativa: d.justificativa, objetivo_geral: d.objetivo_geral,
      objetivos_especificos: d.objetivos_especificos, metas: d.metas, cronograma: d.cronograma, status: d.status };
    try {
      if (d.id) await q(sb.from('projetos').update(reg).eq('id', d.id));
      else { const [n] = await q(sb.from('projetos').insert({ ...reg, gabinete_id: gab }).select('id')); d.id = n.id; }
      avisar('Projeto salvo.');
      desenharEtapa();
    } catch (e) { erro(e); }
  };
  desenharEtapa();
}

await listar();
