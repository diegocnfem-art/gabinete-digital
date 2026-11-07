// Módulos 5 e 6 — Pauta, roteiro de fala, calendário editorial e card
import { sb, h, q, limpar, erro, avisar, iniciarTela, abrirFormulario, fmtData, hojeISO, nomeMes, etiqueta, vazio } from './lib.js';
import { VEICULOS } from './constantes.js';

const ROT_VEIC = Object.fromEntries(VEICULOS);
const { ctx, main } = await iniciarTela('comunicacao.html', 'Comunicação do mandato',
  'Pautas com mensagem-chave, roteiro de fala, calendário de publicações e card para redes.');
const gab = ctx.gab.id;
let pautas = [];
let aba = 'pautas';
const hoje = new Date();
let mesVisto = { a: hoje.getFullYear(), m: hoje.getMonth() };

const abas = h('div', { class: 'abas', role: 'tablist' });
const area = h('div');
main.append(abas, area);
const ABAS = [['pautas', 'Pautas'], ['calendario', 'Calendário editorial'], ['card', 'Card para redes']];
function desenharAbas() {
  limpar(abas).append(...ABAS.map(([k, r]) => h('button', { class: aba === k ? 'ativo' : '', role: 'tab', 'aria-selected': aba === k ? 'true' : 'false',
    onclick: () => { aba = k; desenharAbas(); desenhar(); } }, r)));
}

async function carregar() {
  try {
    pautas = await q(sb.from('pautas').select('*').eq('gabinete_id', gab).eq('arquivado', false).order('data_publicacao', { nullsFirst: true }));
    desenhar();
  } catch (e) { erro(e); }
}

function desenhar() {
  limpar(area);
  if (aba === 'pautas') return abaPautas();
  if (aba === 'calendario') return abaCalendario();
  return abaCard();
}

function abaPautas() {
  area.append(h('div', { class: 'acoes' }, ctx.podeEscrever ? h('button', { class: 'btn primario', onclick: () => editar(null) }, '+ Nova pauta') : null));
  if (!pautas.length) { area.append(vazio('Nenhuma pauta cadastrada.')); return; }
  area.append(h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, ['Tema', 'Mensagem-chave', 'Veículo', 'Publicação', ''].map((t) => h('th', null, t)))),
    h('tbody', null, pautas.map((p) => h('tr', null,
      h('td', null, h('strong', null, p.tema)), h('td', null, p.mensagem_chave),
      h('td', null, etiqueta(ROT_VEIC[p.veiculo], 'azul')), h('td', null, fmtData(p.data_publicacao)),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', { class: 'btn peq', onclick: () => editar(p) }, ctx.podeEscrever ? 'Editar' : 'Ver'), ' ',
        h('a', { class: 'btn peq', href: `documento.html?tipo=roteiro_fala&origem=pautas&id=${p.id}` }, 'Roteiro de fala'), ' ',
        h('button', { class: 'btn peq', onclick: () => { aba = 'card'; desenharAbas(); abaCard(p); } }, 'Card')))))));
}

function editar(p) {
  abrirFormulario({
    titulo: p ? p.tema : 'Nova pauta', somenteLeitura: !ctx.podeEscrever, valores: p || { veiculo: 'redes' },
    campos: [
      { nome: 'tema', rotulo: 'Tema', obrigatorio: true },
      { nome: 'mensagem_chave', rotulo: 'Mensagem-chave', tipo: 'textarea', obrigatorio: true, max: 500, linhas: 2, ajuda: 'a frase que o público deve guardar' },
      { nome: 'dados_apoio', rotulo: 'Dados de apoio', tipo: 'textarea', max: 3000, ajuda: 'números e fatos verificados, com fonte' },
      { nome: 'publico', rotulo: 'Público-alvo', largura: 'meia' },
      { nome: 'veiculo', rotulo: 'Veículo', tipo: 'select', opcoes: VEICULOS, largura: 'meia' },
      { nome: 'data_publicacao', rotulo: 'Data de publicação', tipo: 'data' },
      ...(p ? [{ nome: 'arquivado', rotulo: 'Arquivar', tipo: 'checkbox' }] : []),
    ],
    aoSalvar: async (v) => {
      if (p) await q(sb.from('pautas').update(v).eq('id', p.id));
      else await q(sb.from('pautas').insert({ ...v, gabinete_id: gab }));
      avisar('Pauta salva.'); await carregar();
    },
  });
}

async function definirData(id, data) {
  try {
    await q(sb.from('pautas').update({ data_publicacao: data }).eq('id', id));
    const p = pautas.find((x) => x.id === id); if (p) p.data_publicacao = data;
    desenhar();
  } catch (e) { erro(e); }
}

function chip(p) {
  const c = h('span', { class: 'chip-pauta', draggable: ctx.podeEscrever ? 'true' : null, title: `${p.tema} — ${p.mensagem_chave}` }, `${ROT_VEIC[p.veiculo]}: ${p.tema}`);
  c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', p.id));
  c.addEventListener('click', () => editar(p));
  return c;
}
function alvo(el, data) {
  if (!ctx.podeEscrever) return;
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('alvo'); });
  el.addEventListener('dragleave', () => el.classList.remove('alvo'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('alvo'); definirData(e.dataTransfer.getData('text/plain'), data); });
}

function abaCalendario() {
  const { a, m } = mesVisto;
  const mudar = (d) => { const n = new Date(a, m + d, 1); mesVisto = { a: n.getFullYear(), m: n.getMonth() }; desenhar(); };
  area.append(h('div', { class: 'acoes' },
    h('button', { class: 'btn', onclick: () => mudar(-1) }, '←'), h('strong', null, `${nomeMes(m)} de ${a}`), h('button', { class: 'btn', onclick: () => mudar(1) }, '→'),
    h('span', { class: 'sub dir', style: { margin: 0 } }, ctx.podeEscrever ? 'Arraste as pautas para o dia, ou toque na pauta e escolha a data.' : '')));
  const semData = pautas.filter((p) => !p.data_publicacao);
  const caixaSem = h('div', { class: 'cartao', style: { marginBottom: '12px' } }, h('strong', null, 'Sem data: '), semData.length ? semData.map(chip) : h('span', { class: 'sub' }, 'todas as pautas têm data.'));
  alvo(caixaSem, null);
  area.append(caixaSem);
  const cal = h('div', { class: 'calendario' }, ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => h('div', { class: 'dia-semana' }, d)));
  const inicio = new Date(a, m, 1);
  inicio.setDate(1 - inicio.getDay());
  const hj = hojeISO();
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const cel = h('div', { class: `dia ${d.getMonth() !== m ? 'fora' : ''} ${iso === hj ? 'hoje' : ''}` }, h('div', { class: 'num-dia' }, d.getDate()),
      pautas.filter((p) => p.data_publicacao === iso).map(chip));
    alvo(cel, iso);
    cal.append(cel);
  }
  area.append(cal);
}

// Card simples desenhado em canvas (sem bibliotecas), para baixar como PNG e usar no Canva/redes
function abaCard(pre) {
  limpar(area);
  const sel = h('select', null, h('option', { value: '' }, '— escolher pauta —'), pautas.map((p) => h('option', { value: p.id, selected: pre && pre.id === p.id }, p.tema)));
  const txt = h('textarea', { rows: 3, maxlength: 220, placeholder: 'Mensagem-chave' });
  const assin = h('input', { type: 'text', value: ctx.gab.parlamentar || ctx.gab.nome });
  const corSel = h('select', null, [['#003366', 'Azul institucional'], ['#0B875B', 'Verde'], ['#7a1f2b', 'Vinho'], ['#1f2933', 'Grafite']].map(([v, r]) => h('option', { value: v }, r)));
  const canvas = h('canvas', { width: 1080, height: 1080, style: { width: '100%', maxWidth: '420px', borderRadius: '8px', boxShadow: 'var(--sombra)' } });
  if (pre) txt.value = pre.mensagem_chave;
  sel.addEventListener('change', () => { const p = pautas.find((x) => x.id === sel.value); if (p) txt.value = p.mensagem_chave; render(); });
  [txt, assin, corSel].forEach((el) => el.addEventListener('input', render));
  function quebrar(c, texto, larg) {
    const palavras = texto.split(/\s+/); const linhas = []; let l = '';
    for (const p of palavras) { const t = l ? `${l} ${p}` : p; if (c.measureText(t).width > larg && l) { linhas.push(l); l = p; } else l = t; }
    if (l) linhas.push(l); return linhas;
  }
  function render() {
    const c = canvas.getContext('2d');
    c.fillStyle = corSel.value; c.fillRect(0, 0, 1080, 1080);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, 900, 1080, 180);
    c.fillStyle = '#fff'; c.font = 'bold 64px Segoe UI, Arial, sans-serif';
    const linhas = quebrar(c, txt.value || 'Sua mensagem-chave aqui', 900).slice(0, 8);
    let y = 450 - (linhas.length * 80) / 2 + 60;
    for (const l of linhas) { c.fillText(l, 90, y); y += 80; }
    c.font = '600 40px Segoe UI, Arial, sans-serif'; c.fillText(assin.value, 90, 1000);
    c.fillRect(90, 160, 120, 10);
  }
  area.append(h('div', { class: 'grade-2' },
    h('div', null,
      h('label', { class: 'campo' }, 'Pauta', sel), h('label', { class: 'campo' }, 'Mensagem-chave', txt),
      h('label', { class: 'campo' }, 'Assinatura', assin), h('label', { class: 'campo' }, 'Cor de fundo', corSel),
      h('button', { class: 'btn primario', onclick: () => canvas.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: 'card.png' }); a.click(); }) }, 'Baixar imagem (PNG)'),
      h('p', { class: 'sub', style: { marginTop: '10px' } }, 'Confira os dados antes de publicar. Para peças elaboradas, importe o PNG no Canva.')),
    h('div', null, canvas)));
  render();
}

desenharAbas();
await carregar();
