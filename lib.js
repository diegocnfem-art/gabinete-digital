// =====================================================================
// Núcleo do front-end: sessão, gabinete atual, layout, formulários,
// formatação e utilitários. Toda tela importa daqui.
//
// Regra de segurança: nenhum texto vindo do banco é inserido como HTML.
// Tudo passa por h() (textContent) ou por sanitizarHTML().
// =====================================================================
import { sb } from './supabase-client.js';
import { NOME_SISTEMA } from '../config.js';

export { sb };

// ---------------------------------------------------------------------
// Construção de elementos sem innerHTML
// ---------------------------------------------------------------------
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'required' || k === 'selected' || k === 'multiple') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  anexar(el, filhos);
  return el;
}
function anexar(el, filhos) {
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    if (Array.isArray(f)) anexar(el, f);
    else el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}
export function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// No celular, cada linha de tabela vira um cartão "rótulo: valor".
// Os rótulos vêm do cabeçalho da tabela e são aplicados automaticamente.
function rotularTabelas(raiz = document) {
  for (const t of raiz.querySelectorAll('table.tabela')) {
    const cab = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!cab.length) continue;
    for (const tr of t.querySelectorAll('tbody tr')) {
      [...tr.children].forEach((td, i) => { if (td.tagName === 'TD' && !td.hasAttribute('data-label') && cab[i]) td.setAttribute('data-label', cab[i]); });
    }
  }
}
if (typeof MutationObserver !== 'undefined') {
  let agendado = false;
  new MutationObserver(() => {
    if (agendado) return; agendado = true;
    requestAnimationFrame(() => { agendado = false; rotularTabelas(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------
// Avisos (banners persistentes em vez de alert)
// ---------------------------------------------------------------------
export function avisar(texto, tipo = 'ok', ms = 5000) {
  let box = document.getElementById('avisos');
  if (!box) { box = h('div', { id: 'avisos', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const el = h('div', { class: `aviso ${tipo}` }, texto);
  box.append(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

export function traduzirErro(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/row-level security|permission denied|Sem permissão/i.test(m)) return 'Você não tem permissão para esta ação neste gabinete (ou o gabinete está suspenso).';
  if (/violates check constraint/i.test(m)) return 'Algum campo está vazio, longo demais ou em formato inválido.';
  if (/violates foreign key/i.test(m)) return 'Registro relacionado não encontrado.';
  if (/duplicate key/i.test(m)) return 'Já existe um registro com esses dados.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (/JWT|session|not authenticated/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
  return m;
}

export function erro(e) {
  console.error(e);
  avisar(traduzirErro(e), 'erro', 9000);
}

// Executa uma consulta do Supabase e lança erro se houver
export async function q(promessa) {
  const { data, error } = await promessa;
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Datas, moeda e números
// ---------------------------------------------------------------------
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function diasAte(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const alvo = Date.UTC(a, m - 1, d);
  const [ha, hm, hd] = hojeISO().split('-').map(Number);
  return Math.round((alvo - Date.UTC(ha, hm - 1, hd)) / 864e5);
}
export function fmtData(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (s.length <= 10) { const [a, m, d] = s.split('-'); return `${d}/${m}/${a}`; }
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function dataExtenso(iso = hojeISO()) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
export const nomeMes = (m) => MESES[m];
export function fmtMoeda(v) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// Parser universal de moeda (Relatório de Expertise, 5.1)
export function parseMoeda(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/R\$/g, '').replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  s = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
export function pct(atual, meta) {
  if (!meta) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(atual) / Number(meta)) * 100)));
}

// ---------------------------------------------------------------------
// Utilitários de arquivo
// ---------------------------------------------------------------------
export function baixar(nome, conteudo, tipo = 'application/json') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function sha256Arquivo(arquivo) {
  if (!globalThis.crypto || !crypto.subtle) throw new Error('Conferência de arquivos exige conexão segura (https).');
  const buf = await arquivo.arrayBuffer();
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function paraCSV(linhas) {
  if (!linhas.length) return '';
  const cols = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas maliciosas ao abrir no Excel
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\n');
}

// Preferências locais (podem falhar em navegação privada)
export function lerLocal(chave, padrao = null) {
  try { const v = localStorage.getItem(chave); return v === null ? padrao : v; } catch { return padrao; }
}
export function gravarLocal(chave, valor) { try { localStorage.setItem(chave, valor); } catch { /* ignora */ } }

// ---------------------------------------------------------------------
// Sanitização de HTML (texto editado no gerador de documentos)
// ---------------------------------------------------------------------
const TAGS_OK = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
  'H3', 'H4', 'DIV', 'SPAN', 'BLOCKQUOTE']);
const CLASSES_OK = new Set(['centro', 'recuo', 'citacao', 'direita', 'negrito', 'capa', 'quebra']);
export function sanitizarHTML(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const raiz = doc.body.firstChild;
  const limparNo = (no) => {
    for (const filho of [...no.childNodes]) {
      if (filho.nodeType === 3) continue;
      if (filho.nodeType !== 1) { filho.remove(); continue; }
      if (!TAGS_OK.has(filho.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH'].includes(filho.tagName)) { filho.remove(); continue; }
        limparNo(filho);
        filho.replaceWith(...filho.childNodes);
        continue;
      }
      for (const at of [...filho.attributes]) {
        if (at.name === 'class') {
          const cls = at.value.split(/\s+/).filter((c) => CLASSES_OK.has(c));
          if (cls.length) filho.setAttribute('class', cls.join(' ')); else filho.removeAttribute('class');
        } else if ((at.name === 'colspan' || at.name === 'rowspan') && /^\d{1,2}$/.test(at.value)) {
          // mantém
        } else filho.removeAttribute(at.name);
      }
      limparNo(filho);
    }
  };
  limparNo(raiz);
  return raiz.innerHTML;
}
// Converte texto simples em parágrafos seguros
export function paragrafos(texto) {
  return String(texto || '').split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${escapar(p).replace(/\n/g, '<br>')}</p>`).join('');
}
export function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------
// Sessão e gabinete atual
// ---------------------------------------------------------------------
export async function sessaoAtual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function entrarComGoogle() {
  const destino = new URL('index.html', location.href).href;
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: destino } });
  if (error) erro(error);
}
export async function sair() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

// Interrompe a tela sem gerar erro (usado após redirecionar)
export const parar = () => new Promise(() => {});

export async function carregarContexto({ exigirGabinete = true } = {}) {
  const sessao = await sessaoAtual();
  if (!sessao) { location.href = 'index.html'; return parar(); }
  const email = (sessao.user.email || '').toLowerCase();
  const [gabinetes, adminPlataforma] = await Promise.all([
    q(sb.rpc('meus_gabinetes')),
    q(sb.rpc('eh_admin_plataforma')),
  ]);
  const pedido = new URLSearchParams(location.search).get('g');
  if (pedido && gabinetes.some((g) => g.id === pedido)) gravarLocal('gd.gabinete', pedido);
  const salvo = lerLocal('gd.gabinete');
  const gab = gabinetes.find((g) => g.id === salvo) || gabinetes[0] || null;
  if (gab) gravarLocal('gd.gabinete', gab.id);
  if (exigirGabinete && !gab) { location.href = 'index.html'; return parar(); }
  const papel = gab ? gab.papel : null;
  return {
    sessao, email, gabinetes, gab, papel, adminPlataforma,
    podeEscrever: !!gab && gab.situacao === 'ativo' && (papel === 'admin' || papel === 'assessor'),
    ehAdmin: papel === 'admin',
  };
}

// ---------------------------------------------------------------------
// Layout: topo + menu
// ---------------------------------------------------------------------
export const PAGINAS = [
  ['index.html', 'Início'],
  ['demandas.html', 'Demandas'],
  ['okrs.html', 'OKRs'],
  ['emendas.html', 'Emendas'],
  ['projetos.html', 'Projetos'],
  ['comunicacao.html', 'Comunicação'],
  ['captacao.html', 'Captação'],
  ['proposicoes.html', 'Proposições'],
  ['documentos.html', 'Documentos'],
];

export function montarLayout(ctx, paginaAtual) {
  const raiz = document.getElementById('app');
  limpar(raiz);
  const seletor = ctx.gabinetes.length > 1
    ? h('select', {
      'aria-label': 'Gabinete', onchange: (e) => { gravarLocal('gd.gabinete', e.target.value); location.reload(); },
    }, ctx.gabinetes.map((g) => h('option', { value: g.id, selected: ctx.gab && g.id === ctx.gab.id }, g.nome)))
    : (ctx.gab ? h('span', null, ctx.gab.nome) : null);
  const itens = [...PAGINAS];
  if (ctx.ehAdmin) itens.push(['admin.html', 'Administração']);
  if (ctx.adminPlataforma) itens.push(['plataforma.html', 'Plataforma']);
  const topo = h('header', { class: 'topo' },
    h('div', { class: 'topo-linha' },
      h('a', { class: 'marca', href: 'index.html' }, NOME_SISTEMA, ctx.gab ? h('small', null, ctx.gab.sigla) : null),
      ctx.gab && ctx.gab.plano === 'demo' ? h('span', { class: 'selo-demo', title: 'Use apenas dados fictícios' }, 'DEMONSTRAÇÃO') : null,
      h('div', { class: 'topo-dir' },
        seletor,
        h('span', { class: 'usuario', title: 'Seu perfil neste gabinete' }, ctx.email, ctx.papel ? ` · ${ctx.papel}` : ''),
        h('button', { class: 'btn-sair', onclick: sair }, 'Sair'))),
    h('nav', { class: 'menu', 'aria-label': 'Módulos' },
      itens.map(([href, rot]) => h('a', { href, class: href === paginaAtual ? 'ativo' : null }, rot))));
  const main = h('main', { id: 'conteudo' });
  raiz.append(topo, main);
  if (ctx.gab && ctx.gab.situacao !== 'ativo') {
    main.append(h('div', { class: 'aviso alerta' }, `Este gabinete está ${ctx.gab.situacao}. Os dados podem ser consultados e exportados, mas não alterados.`));
  } else if (ctx.gab && ctx.papel === 'leitura') {
    main.append(h('div', { class: 'aviso info' }, 'Seu perfil é somente leitura neste gabinete.'));
  }
  return main;
}

// Inicializa uma tela de módulo: sessão + layout. Retorna { ctx, main }.
export async function iniciarTela(pagina, titulo, subtitulo) {
  try {
    const ctx = await carregarContexto();
    const main = montarLayout(ctx, pagina);
    document.title = `${titulo} · ${NOME_SISTEMA}`;
    main.append(h('h1', null, titulo));
    if (subtitulo) main.append(h('p', { class: 'sub' }, subtitulo));
    return { ctx, main };
  } catch (e) {
    erro(e);
    return parar();
  }
}

// ---------------------------------------------------------------------
// Formulário em janela (dialog)
// campos: [{ nome, rotulo, tipo, obrigatorio, opcoes:[[valor, rótulo]], max, ajuda, largura:'meia' }]
// tipos: texto, textarea, numero, moeda, data, select, checkbox, email, url, linhas, simnao
// ---------------------------------------------------------------------
export function abrirFormulario({ titulo, campos, valores = {}, rotuloSalvar = 'Salvar', aoSalvar, extra, somenteLeitura = false }) {
  const dlg = h('dialog');
  const entradas = {};
  const corpo = h('div', { class: 'modal-corpo' });
  const msg = h('div');
  corpo.append(msg);

  let grade = null;
  for (const c of campos) {
    const v = valores[c.nome];
    let entrada;
    const comum = { name: c.nome, required: c.obrigatorio, disabled: somenteLeitura || c.desativado };
    switch (c.tipo) {
      case 'textarea':
        entrada = h('textarea', { ...comum, maxlength: c.max || 5000, rows: c.linhas || 4 });
        entrada.value = v ?? ''; break;
      case 'linhas':
        entrada = h('textarea', { ...comum, rows: c.linhas || 4, placeholder: 'Um item por linha' });
        entrada.value = Array.isArray(v) ? v.join('\n') : (v ?? ''); break;
      case 'select':
        entrada = h('select', comum, (c.opcoes || []).map(([val, rot]) => h('option', { value: val, selected: String(v ?? c.padrao ?? '') === String(val) }, rot)));
        break;
      case 'checkbox':
        entrada = h('input', { ...comum, type: 'checkbox', checked: !!v }); break;
      case 'simnao': {
        const nomeGrupo = `sn-${c.nome}-${Math.random().toString(36).slice(2, 7)}`;
        const op = (val, rot) => h('label', null, h('input', { type: 'radio', name: nomeGrupo, value: val, checked: v === val, disabled: comum.disabled }), rot);
        entrada = h('div', { class: 'simnao', dataset: { simnao: '1' } }, op('sim', 'Sim'), op('nao', 'Não'), op('', 'Não verificado'));
        if (!v) entrada.querySelector('input[value=""]').checked = true;
        break;
      }
      case 'moeda':
        entrada = h('input', { ...comum, type: 'text', inputmode: 'decimal', placeholder: '0,00' });
        entrada.value = v !== undefined && v !== null && v !== '' ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''; break;
      case 'numero':
        entrada = h('input', { ...comum, type: 'number', step: c.passo || 'any', min: c.min });
        entrada.value = v ?? ''; break;
      case 'data':
        entrada = h('input', { ...comum, type: 'date' }); entrada.value = v ? String(v).slice(0, 10) : ''; break;
      case 'email':
        entrada = h('input', { ...comum, type: 'email' }); entrada.value = v ?? ''; break;
      case 'url':
        entrada = h('input', { ...comum, type: 'url', placeholder: 'https://' }); entrada.value = v ?? ''; break;
      default:
        entrada = h('input', { ...comum, type: 'text', maxlength: c.max || 300 }); entrada.value = v ?? '';
    }
    entradas[c.nome] = { c, entrada };
    const rotulo = c.tipo === 'checkbox'
      ? h('label', { class: 'campo linha-check' }, entrada, c.rotulo)
      : h('label', { class: 'campo' }, c.rotulo, c.obrigatorio ? ' *' : '', c.ajuda ? h('small', null, ` — ${c.ajuda}`) : null, entrada);
    if (c.largura === 'meia') {
      if (!grade) { grade = h('div', { class: 'grade-2' }); corpo.append(grade); }
      grade.append(rotulo);
    } else { grade = null; corpo.append(rotulo); }
  }
  if (extra) corpo.append(extra);

  const ler = () => {
    const r = {};
    for (const [nome, { c, entrada }] of Object.entries(entradas)) {
      if (c.tipo === 'checkbox') r[nome] = entrada.checked;
      else if (c.tipo === 'simnao') { const s = entrada.querySelector('input:checked'); r[nome] = s && s.value ? s.value : null; }
      else if (c.tipo === 'moeda') r[nome] = entrada.value.trim() === '' ? null : parseMoeda(entrada.value);
      else if (c.tipo === 'numero') r[nome] = entrada.value === '' ? null : Number(entrada.value);
      else if (c.tipo === 'linhas') r[nome] = entrada.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else { const t = entrada.value.trim(); r[nome] = t === '' ? null : t; }
    }
    return r;
  };

  const btnSalvar = h('button', { class: 'btn primario', type: 'button' }, rotuloSalvar);
  const fechar = () => { dlg.close(); dlg.remove(); };
  btnSalvar.addEventListener('click', async () => {
    const dados = ler();
    for (const { c } of Object.values(entradas)) {
      const val = dados[c.nome];
      if (c.obrigatorio && (val === null || val === '' || (Array.isArray(val) && !val.length))) {
        limpar(msg).append(h('div', { class: 'aviso erro' }, `Preencha o campo "${c.rotulo}".`));
        entradas[c.nome].entrada.focus?.();
        return;
      }
    }
    btnSalvar.disabled = true;
    try {
      await aoSalvar(dados);
      fechar();
    } catch (e) {
      console.error(e);
      limpar(msg).append(h('div', { class: 'aviso erro' }, traduzirErro(e)));
    } finally { btnSalvar.disabled = false; }
  });

  dlg.append(
    h('div', { class: 'modal-topo' }, h('h3', null, titulo), h('button', { class: 'fechar', type: 'button', 'aria-label': 'Fechar', onclick: fechar }, '×')),
    corpo,
    h('div', { class: 'modal-rodape' },
      h('button', { class: 'btn', type: 'button', onclick: fechar }, somenteLeitura ? 'Fechar' : 'Cancelar'),
      somenteLeitura || !aoSalvar ? null : btnSalvar));
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, fechar, entradas };
}

// Janela simples de conteúdo
export function abrirJanela(titulo, conteudo, botoes = []) {
  const dlg = h('dialog');
  const fechar = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    h('div', { class: 'modal-topo' }, h('h3', null, titulo), h('button', { class: 'fechar', type: 'button', 'aria-label': 'Fechar', onclick: fechar }, '×')),
    h('div', { class: 'modal-corpo' }, conteudo),
    h('div', { class: 'modal-rodape' }, botoes, h('button', { class: 'btn', type: 'button', onclick: fechar }, 'Fechar')));
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, fechar };
}

export function confirmar(texto) {
  return new Promise((resolve) => {
    const dlg = h('dialog');
    const fim = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.append(h('div', { class: 'modal-corpo' }, h('p', null, texto)),
      h('div', { class: 'modal-rodape' },
        h('button', { class: 'btn', onclick: () => fim(false) }, 'Cancelar'),
        h('button', { class: 'btn primario', onclick: () => fim(true) }, 'Confirmar')));
    dlg.addEventListener('cancel', () => fim(false));
    document.body.append(dlg);
    dlg.showModal();
  });
}

// Histórico de um registro (trilha de auditoria)
export async function historico(registroId, rotuloCampo = (antes, depois) => null) {
  const linhas = await q(sb.from('auditoria').select('id, acao, usuario, em, antes, depois')
    .eq('registro_id', registroId).order('id', { ascending: false }).limit(50));
  if (!linhas.length) return h('p', { class: 'sub' }, 'Sem histórico.');
  return h('ul', { class: 'historico' }, linhas.map((l) => {
    const desc = l.acao === 'INSERT' ? 'Criado' : (rotuloCampo(l.antes, l.depois) || 'Alterado');
    return h('li', null, h('strong', null, desc), h('br'), h('small', null, `${fmtData(l.em)} · ${l.usuario}`));
  }));
}

// Membros do gabinete (para escolher responsáveis)
export async function membrosDoGabinete(gabId) {
  const m = await q(sb.from('membros').select('email, nome, papel, ativo').eq('gabinete_id', gabId).eq('ativo', true).order('nome'));
  return m.map((x) => [x.nome || x.email, x.nome || x.email]);
}

export function etiqueta(texto, cor) { return h('span', { class: `etiqueta ${cor || ''}` }, texto); }
export function vazio(texto) { return h('div', { class: 'vazio' }, texto); }

export function urlBase() { return new URL('.', location.href).href; }
