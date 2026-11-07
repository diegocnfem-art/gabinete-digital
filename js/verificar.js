// Verificação PÚBLICA de autenticidade (não exige login).
// Mostra só metadados (gabinete, tipo, número, data) — nunca o conteúdo nem dados pessoais.
import { sb, h, q, limpar, erro, fmtData, sha256Arquivo } from './lib.js';
import { TIPOS_DOCUMENTO } from './constantes.js';
import { NOME_SISTEMA } from '../config.js';

const app = document.getElementById('app');
const codigo = h('input', { type: 'text', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', maxlength: 40, autocomplete: 'off', 'aria-label': 'Código de verificação' });
codigo.value = new URLSearchParams(location.search).get('c') || '';
const resultado = h('div');

limpar(app).append(
  h('header', { class: 'topo' }, h('div', { class: 'topo-linha' }, h('span', { class: 'marca' }, NOME_SISTEMA, h('small', null, 'Verificação de documentos')))),
  h('main', { style: { maxWidth: '720px' } },
    h('h1', null, 'Verificar autenticidade de documento'),
    h('p', { class: 'sub' }, 'Digite o código impresso no rodapé do documento (ou leia o QR Code).'),
    h('div', { class: 'cartao' },
      h('label', { class: 'campo' }, 'Código de verificação', codigo),
      h('button', { class: 'btn primario', onclick: () => verificar() }, 'Verificar')),
    resultado,
    h('p', { class: 'sub', style: { marginTop: '24px', fontSize: '.85rem' } },
      'Esta página confirma que o documento foi emitido pelo gabinete e se o arquivo é idêntico ao registrado. ',
      'A validade jurídica da assinatura digital gov.br/ICP-Brasil é conferida no ',
      h('a', { href: 'https://validar.iti.gov.br', target: '_blank', rel: 'noopener noreferrer' }, 'Validar, do ITI'), '.')));
codigo.addEventListener('keydown', (e) => { if (e.key === 'Enter') verificar(); });

async function verificar() {
  limpar(resultado);
  const c = codigo.value.trim();
  if (!c) return;
  try {
    const linhas = await q(sb.rpc('verificar_documento', { p_codigo: c }));
    const d = linhas[0];
    if (!d) { resultado.append(h('div', { class: 'aviso erro', style: { marginTop: '16px' } }, 'Código não encontrado. Confira os caracteres ou entre em contato com o gabinete emissor.')); return; }
    const conferencia = h('div');
    const arq = h('input', { type: 'file', accept: 'application/pdf' });
    arq.addEventListener('change', async () => {
      limpar(conferencia);
      const f = arq.files[0]; if (!f) return;
      const hash = await sha256Arquivo(f);
      if (!d.arquivo_hash) conferencia.append(h('div', { class: 'aviso alerta' }, 'O gabinete ainda não registrou o PDF final deste documento, então não é possível comparar o arquivo.'));
      else if (hash === d.arquivo_hash) conferencia.append(h('div', { class: 'aviso ok' }, h('strong', null, 'Arquivo idêntico ao registrado. '), 'Não houve nenhuma alteração.'));
      else conferencia.append(h('div', { class: 'aviso erro' }, h('strong', null, 'Arquivo DIFERENTE do registrado. '), 'Ele pode ter sido alterado ou ser outra versão.'));
    });
    resultado.append(h('div', { class: `aviso ${d.cancelado ? 'erro' : 'ok'}`, style: { marginTop: '16px' } },
      h('strong', null, d.cancelado ? 'Documento CANCELADO pelo emissor.' : 'Documento autêntico — emitido pelo sistema.'),
      h('table', { class: 'tabela', style: { marginTop: '10px', boxShadow: 'none' } }, h('tbody', null,
        [['Emissor', d.gabinete], ['Casa legislativa', d.casa_legislativa || '—'], ['Tipo', TIPOS_DOCUMENTO[d.tipo] || d.tipo],
          ['Número', d.numero], ['Emitido em', fmtData(d.emitido_em)],
          ['PDF final', d.arquivo_hash ? `${d.arquivo_assinado ? 'assinado digitalmente, ' : ''}registrado em ${fmtData(d.arquivo_registrado_em)}` : 'não registrado']]
          .map(([a, b]) => h('tr', null, h('th', null, a), h('td', null, b)))))),
    h('div', { class: 'cartao', style: { marginTop: '12px' } },
      h('label', { class: 'campo' }, 'Conferir um arquivo (opcional) — o arquivo não sai do seu computador; só sua impressão digital é comparada', arq), conferencia));
  } catch (e) { erro(e); }
}
if (codigo.value) verificar();
