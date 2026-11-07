// Lista de documentos emitidos pelo gabinete
import { sb, h, q, limpar, erro, iniciarTela, fmtData, etiqueta, vazio } from './lib.js';
import { TIPOS_DOCUMENTO } from './constantes.js';

const { ctx, main } = await iniciarTela('documentos.html', 'Documentos emitidos',
  'Todo documento emitido recebe número sequencial e código de verificação. Registre aqui o PDF assinado.');
const gab = ctx.gab.id;
let filtro = '';
const area = h('div');
main.append(h('div', { class: 'acoes' },
  ctx.podeEscrever ? h('a', { class: 'btn primario', href: 'documento.html?tipo=oficio' }, '+ Novo ofício avulso') : null,
  h('a', { class: 'btn', href: 'verificar.html' }, 'Página pública de verificação'),
  h('div', { class: 'filtros dir' }, h('select', { 'aria-label': 'Tipo', onchange: (e) => { filtro = e.target.value; carregar(); } },
    h('option', { value: '' }, 'Todos os tipos'), Object.entries(TIPOS_DOCUMENTO).map(([v, r]) => h('option', { value: v }, r))))), area);

async function carregar() {
  limpar(area);
  try {
    let c = sb.from('documentos').select('id, tipo, numero, titulo, emitido_em, emitido_por, arquivo_hash, arquivo_assinado, cancelado, codigo')
      .eq('gabinete_id', gab).order('emitido_em', { ascending: false }).limit(500);
    if (filtro) c = c.eq('tipo', filtro);
    const docs = await q(c);
    if (!docs.length) { area.append(vazio('Nenhum documento emitido ainda. Os documentos são gerados a partir de cada módulo.')); return; }
    area.append(h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Número', 'Tipo', 'Título', 'Emitido', 'PDF final', 'Código', ''].map((t) => h('th', null, t)))),
      h('tbody', null, docs.map((d) => h('tr', null,
        h('td', null, h('strong', null, d.numero)), h('td', null, TIPOS_DOCUMENTO[d.tipo]), h('td', null, d.titulo),
        h('td', null, fmtData(d.emitido_em), h('br'), h('small', null, d.emitido_por)),
        h('td', null, d.cancelado ? etiqueta('cancelado', 'vermelho')
          : d.arquivo_assinado ? etiqueta('assinado', 'verde') : d.arquivo_hash ? etiqueta('registrado', 'azul') : etiqueta('pendente', 'amarelo')),
        h('td', null, h('small', null, d.codigo)),
        h('td', null, h('a', { class: 'btn peq', href: `documento.html?doc=${d.id}` }, 'Abrir')))))));
  } catch (e) { erro(e); }
}
await carregar();
