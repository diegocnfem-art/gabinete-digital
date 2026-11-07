// Gerador de documentos (todos os módulos) + emissão com número e código de verificação
import { sb, h, q, limpar, erro, avisar, carregarContexto, montarLayout, escapar, paragrafos, sanitizarHTML,
  dataExtenso, fmtData, fmtMoeda, pct, sha256Arquivo, urlBase, confirmar, abrirFormulario } from './lib.js';
import { ITENS_CHECKLIST, TIPOS_DOCUMENTO, VEICULOS } from './constantes.js';

const params = new URLSearchParams(location.search);
const ctx = await carregarContexto();
const main = montarLayout(ctx, 'documentos.html');
const E = escapar;
const assinatura = (g) => `<p class="centro">Atenciosamente,</p><p class="centro"><br><br><strong>${E(g.assinatura_nome || g.parlamentar || '[Nome da autoridade signatária]')}</strong><br>${E(g.assinatura_cargo || '[Cargo]')}</p>`;
const ROT_VEIC = Object.fromEntries(VEICULOS);

// ---------------------------------------------------------------------
// Modelos: cada um devolve { titulo, html } a partir do registro de origem
// ---------------------------------------------------------------------
const MODELOS = {
  async oficio_resposta(g, d) {
    return {
      titulo: `Resposta à demanda de ${d.solicitante}`,
      html: `<p><strong>OFÍCIO Nº {{NUMERO}}</strong></p><p class="direita">${dataExtenso()}.</p>
<p>A(o) Senhor(a)<br><strong>${E(d.solicitante)}</strong></p>
<p><strong>Assunto:</strong> Resposta à demanda registrada neste gabinete em ${fmtData(d.criado_em.slice(0, 10))}.</p>
<p>Prezado(a) Senhor(a),</p>
<p class="recuo">Cumprimentando-o(a) cordialmente, em atenção à demanda apresentada a este gabinete, referente a: “${E(d.descricao)}”, informamos:</p>
${d.resposta ? paragrafos(d.resposta).replace(/<p>/g, '<p class="recuo">') : '<p class="recuo">[Descreva aqui o encaminhamento dado e o resultado obtido.]</p>'}
<p class="recuo">Permanecemos à disposição para eventuais esclarecimentos.</p>
${assinatura(g)}`,
    };
  },
  async oficio_cobranca(g, p) {
    return {
      titulo: `Cobrança de resposta — ${p.tipo} ${p.numero}`,
      html: `<p><strong>OFÍCIO Nº {{NUMERO}}</strong></p><p class="direita">${dataExtenso()}.</p>
<p>A(o) Senhor(a) Titular<br><strong>${E(p.orgao_destino || '[Órgão destinatário]')}</strong></p>
<p><strong>Assunto:</strong> Reiteração — ${E(p.tipo)} nº ${E(p.numero)}.</p>
<p>Senhor(a) Titular,</p>
<p class="recuo">Cumprimentando-o(a) cordialmente, reiteramos o ${E(p.tipo)} nº ${E(p.numero)}, apresentado em ${fmtData(p.data_apresentacao)}, que trata de: “${E(p.ementa)}”.</p>
<p class="recuo">O prazo de ${E(p.prazo_dias ?? '[x]')} dias para resposta encerrou-se em ${fmtData(p.prazo_final)}, sem manifestação deste órgão até a presente data, conforme [citar o dispositivo regimental ou constitucional aplicável].</p>
<p class="recuo">Diante disso, solicitamos o envio das informações requeridas no prazo de [x] dias, a contar do recebimento deste ofício.</p>
${assinatura(g)}`,
    };
  },
  async oficio(g) {
    return {
      titulo: 'Ofício',
      html: `<p><strong>OFÍCIO Nº {{NUMERO}}</strong></p><p class="direita">${dataExtenso()}.</p>
<p>A(o) Senhor(a)<br><strong>[Nome e cargo do destinatário]</strong><br>[Órgão]</p>
<p><strong>Assunto:</strong> [Assunto].</p><p>Senhor(a),</p>
<p class="recuo">[Texto do ofício.]</p>${assinatura(g)}`,
    };
  },
  async checklist_emenda(g, e) {
    const op = (v) => (v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : 'Não verificado');
    return {
      titulo: `Checklist — emenda ${e.numero}`,
      html: `<p class="centro"><strong>CHECKLIST DE ANÁLISE PRELIMINAR DE EMENDA PARLAMENTAR Nº {{NUMERO}}</strong></p>
<table><tbody>
<tr><th>Número da emenda</th><td>${E(e.numero)}</td></tr>
<tr><th>Objeto</th><td>${E(e.objeto)}</td></tr>
<tr><th>Valor</th><td>${fmtMoeda(e.valor)}</td></tr>
<tr><th>Órgão de destino</th><td>${E(e.orgao_destino || '—')}</td></tr>
<tr><th>Autor</th><td>${E(e.autor || '—')}</td></tr></tbody></table>
<table><thead><tr><th>Item verificado</th><th>Resultado</th></tr></thead><tbody>
${ITENS_CHECKLIST.map(([k, r]) => `<tr><td>${E(r)}</td><td class="centro">${op(e.checklist?.[k])}</td></tr>`).join('')}
</tbody></table>
<p><strong>Situação da documentação:</strong> ${E(e.status)}.</p>
${e.observacoes ? `<p><strong>Observações:</strong></p>${paragrafos(e.observacoes)}` : ''}
<p><em>Análise técnica preliminar. Não aprova a emenda nem substitui a análise do órgão competente.</em></p>
<p class="centro"><br><br>_____________________________________<br>Responsável pela análise — ${dataExtenso()}</p>`,
    };
  },
  async plano_trabalho(g, p) {
    const lista = (a) => `<ol>${a.map((x) => `<li>${E(x)}</li>`).join('')}</ol>`;
    return {
      titulo: `Plano de trabalho — ${p.titulo}`,
      html: `<div class="capa"><p class="centro"><br><br><br><strong>PLANO DE TRABALHO Nº {{NUMERO}}</strong></p>
<h3 class="centro">${E(p.titulo)}</h3><p class="centro"><br>${E(g.nome)}<br>${dataExtenso()}</p></div>
<div class="quebra"></div>
<h3>Sumário</h3><ol><li>Problema</li><li>Justificativa</li><li>Objetivo geral</li><li>Objetivos específicos</li><li>Metas e indicadores</li><li>Cronograma</li></ol>
<h3>1. Problema</h3>${paragrafos(p.problema)}
<h3>2. Justificativa</h3>${paragrafos(p.justificativa)}
<h3>3. Objetivo geral</h3>${paragrafos(p.objetivo_geral)}
<h3>4. Objetivos específicos</h3>${lista(p.objetivos_especificos || [])}
<h3>5. Metas e indicadores</h3><table><thead><tr><th>Meta</th><th>Quantidade</th><th>Indicador</th><th>Fonte de verificação</th></tr></thead><tbody>
${(p.metas || []).map((m) => `<tr><td>${E(m.meta)}</td><td>${E(m.quantidade)}</td><td>${E(m.indicador)}</td><td>${E(m.fonte)}</td></tr>`).join('')}</tbody></table>
<h3>6. Cronograma</h3><table><thead><tr><th>Atividade</th><th>Responsável</th><th>Início</th><th>Fim</th></tr></thead><tbody>
${(p.cronograma || []).map((c) => `<tr><td>${E(c.atividade)}</td><td>${E(c.responsavel)}</td><td>${fmtData(c.inicio)}</td><td>${fmtData(c.fim)}</td></tr>`).join('')}</tbody></table>`,
    };
  },
  async roteiro_fala(g, p) {
    const tempo = { radio: 'até 1 minuto', tv: 'até 30 segundos por resposta', redes: 'até 60 segundos de vídeo', imprensa: 'respostas curtas, 2 a 3 frases', evento: '3 a 5 minutos' }[p.veiculo];
    return {
      titulo: `Roteiro de fala — ${p.tema}`,
      html: `<p class="centro"><strong>ROTEIRO DE FALA Nº {{NUMERO}}</strong></p>
<table><tbody><tr><th>Tema</th><td>${E(p.tema)}</td></tr><tr><th>Veículo</th><td>${E(ROT_VEIC[p.veiculo])} — ${E(tempo)}</td></tr>
<tr><th>Público</th><td>${E(p.publico || '—')}</td></tr><tr><th>Data</th><td>${fmtData(p.data_publicacao)}</td></tr></tbody></table>
<h3>1. Introdução</h3><p>Cumprimente o público e apresente o tema em uma frase: ${E(p.tema)}.</p>
<h3>2. Mensagem-chave</h3><p><strong>“${E(p.mensagem_chave)}”</strong></p>
<h3>3. Desenvolvimento — dados de apoio</h3>${p.dados_apoio ? paragrafos(p.dados_apoio) : '<p>[Inclua 2 ou 3 dados verificados, com fonte.]</p>'}
<h3>4. Conclusão</h3><p>Repita a mensagem-chave e diga o que o público pode fazer ou onde encontrar mais informações.</p>
<p><em>Confira todos os números e fontes antes de falar.</em></p>`,
    };
  },
  async relatorio_okr(g) {
    const [objs, krs] = await Promise.all([
      q(sb.from('okr_objetivos').select('*').eq('gabinete_id', g.id).eq('arquivado', false).order('criado_em')),
      q(sb.from('okr_krs').select('*').eq('gabinete_id', g.id).eq('arquivado', false).order('criado_em')),
    ]);
    return {
      titulo: `Relatório de OKRs — ${dataExtenso()}`,
      html: `<p class="centro"><strong>RELATÓRIO DE ACOMPANHAMENTO DE OKRs Nº {{NUMERO}}</strong></p><p class="centro">Posição em ${dataExtenso()}</p>
${objs.map((o) => {
    const ks = krs.filter((k) => k.objetivo_id === o.id);
    const med = ks.length ? Math.round(ks.reduce((s, k) => s + pct(k.atual, k.meta), 0) / ks.length) : 0;
    return `<h3>${E(o.titulo)} — ${med}%</h3><table><thead><tr><th>Resultado-chave</th><th>Meta</th><th>Atual</th><th>%</th><th>Prazo</th></tr></thead><tbody>
${ks.map((k) => `<tr><td>${E(k.descricao)}</td><td>${E(k.meta)} ${E(k.unidade || '')}</td><td>${E(k.atual)}</td><td>${pct(k.atual, k.meta)}%</td><td>${fmtData(k.prazo)}</td></tr>`).join('')}</tbody></table>`;
  }).join('') || '<p>Nenhum objetivo cadastrado.</p>'}
<p><strong>Análise e próximos passos:</strong></p><p>[Comente desvios, causas e ajustes.]</p>`,
    };
  },
};

// ---------------------------------------------------------------------
// Montagem da folha
// ---------------------------------------------------------------------
function cabecalho(g) {
  return h('div', { class: 'cab' },
    g.brasao_url && /^https:\/\//.test(g.brasao_url) ? h('img', { src: g.brasao_url, alt: '' }) : null,
    (g.cabecalho && g.cabecalho.length ? g.cabecalho : [g.nome]).map((l) => h('p', null, l)), h('hr'));
}
function corpoHTML(html, editavel) {
  const corpo = h('div', { class: 'corpo', contenteditable: editavel ? 'true' : null, spellcheck: 'true' });
  corpo.append(new DOMParser().parseFromString(`<div>${sanitizarHTML(html)}</div>`, 'text/html').body.firstChild);
  return corpo;
}
function rodapeVerificacao(doc) {
  const url = `${urlBase()}verificar.html?c=${encodeURIComponent(doc.codigo)}`;
  const box = h('div', { class: 'rodape-verif' });
  try {
    if (window.qrcode) {
      const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
      const svg = new DOMParser().parseFromString(qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true }), 'image/svg+xml').documentElement;
      box.append(document.importNode(svg, true));
    }
  } catch { /* QR opcional */ }
  box.append(h('div', null,
    h('div', null, `Documento ${doc.numero} emitido em ${fmtData(doc.emitido_em)} no sistema Gabinete Digital.`),
    h('div', null, 'Código de verificação: ', h('strong', null, doc.codigo)),
    h('div', null, `Confira a autenticidade em ${url}`)));
  return box;
}

// ---------------------------------------------------------------------
// MODO 1: rascunho a partir de um registro (ainda não emitido)
// ---------------------------------------------------------------------
async function modoRascunho() {
  const tipo = params.get('tipo');
  const origem = params.get('origem');
  const id = params.get('id');
  if (!MODELOS[tipo]) { main.append(h('div', { class: 'aviso erro' }, 'Tipo de documento desconhecido.')); return; }
  const g = ctx.gab;
  let registro = null;
  if (origem && id) {
    const permitidas = ['demandas', 'emendas', 'projetos', 'pautas', 'proposicoes'];
    if (!permitidas.includes(origem)) throw new Error('Origem inválida');
    [registro] = await q(sb.from(origem).select('*').eq('id', id).eq('gabinete_id', g.id));
    if (!registro) { main.append(h('div', { class: 'aviso erro' }, 'Registro não encontrado neste gabinete.')); return; }
  }
  const modelo = await MODELOS[tipo](g, registro);
  const titulo = h('input', { type: 'text', value: modelo.titulo, maxlength: 300 });
  const corpo = corpoHTML(modelo.html, ctx.podeEscrever);
  const folha = h('div', { class: 'folha' }, cabecalho(g), corpo);

  const emitir = h('button', { class: 'btn verde', disabled: !ctx.podeEscrever }, 'Emitir documento (gera número e código)');
  emitir.addEventListener('click', async () => {
    if (!(await confirmar('Depois de emitido, o texto fica registrado e não pode mais ser editado. Emitir agora?'))) return;
    emitir.disabled = true;
    try {
      const conteudo = sanitizarHTML(corpo.innerHTML);
      const doc = await q(sb.rpc('emitir_documento', {
        p_gabinete: g.id, p_tipo: tipo, p_titulo: titulo.value, p_conteudo: conteudo,
        p_origem_tabela: origem || null, p_origem_id: id || null,
      }));
      location.href = `documento.html?doc=${encodeURIComponent(doc.id)}`;
    } catch (e) { erro(e); emitir.disabled = false; }
  });

  main.append(h('div', { class: 'painel-doc' },
    h('h1', null, TIPOS_DOCUMENTO[tipo]),
    h('div', { class: 'aviso info' }, 'Revise e edite o texto diretamente na folha. O número oficial e o código de verificação são gerados ao emitir.'),
    h('label', { class: 'campo' }, 'Título interno (aparece na lista de documentos)', titulo),
    h('div', { class: 'acoes' }, emitir, h('button', { class: 'btn', onclick: () => history.back() }, 'Cancelar'),
      h('button', { class: 'btn dir', onclick: () => window.print() }, 'Pré-visualizar impressão'))), folha);
}

// ---------------------------------------------------------------------
// MODO 2: documento emitido (somente leitura) + PDF assinado
// ---------------------------------------------------------------------
async function modoEmitido(docId) {
  const [doc] = await q(sb.from('documentos').select('*').eq('id', docId));
  if (!doc) { main.append(h('div', { class: 'aviso erro' }, 'Documento não encontrado.')); return; }
  const g = ctx.gabinetes.find((x) => x.id === doc.gabinete_id) || ctx.gab;
  const podeEscrever = g.situacao === 'ativo' && ['admin', 'assessor'].includes(g.papel);
  const corpo = corpoHTML(doc.conteudo.replaceAll('{{NUMERO}}', E(doc.numero)), false);
  const folha = h('div', { class: 'folha' }, cabecalho(g), corpo, rodapeVerificacao(doc));

  const copiar = () => {
    const r = document.createRange(); r.selectNodeContents(folha);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    try { document.execCommand('copy'); avisar('Documento copiado com formatação. Cole no SEI ou no Word.'); }
    catch { avisar('Selecione e copie manualmente (Ctrl+C).', 'alerta'); }
    s.removeAllRanges();
  };

  const situacaoArquivo = doc.arquivo_hash
    ? h('div', { class: 'aviso ok' }, `${doc.arquivo_assinado ? 'PDF ASSINADO' : 'PDF'} registrado em ${fmtData(doc.arquivo_registrado_em)} por ${doc.arquivo_registrado_por}.`,
      h('br'), h('small', null, `SHA-256: ${doc.arquivo_hash}`))
    : h('div', { class: 'aviso alerta' }, 'Nenhum PDF final registrado ainda.');

  const painel = h('div', { class: 'painel-doc' },
    h('h1', null, `${TIPOS_DOCUMENTO[doc.tipo]} nº ${doc.numero}`),
    doc.cancelado ? h('div', { class: 'aviso erro' }, `DOCUMENTO CANCELADO: ${doc.cancelado_motivo}`) : null,
    h('div', { class: 'acoes' },
      h('button', { class: 'btn primario', onclick: () => window.print() }, 'Imprimir / Salvar PDF'),
      h('button', { class: 'btn', onclick: copiar }, 'Copiar para SEI'),
      doc.arquivo_path ? h('button', { class: 'btn', onclick: async () => {
        try { const { signedUrl } = await q(sb.storage.from('documentos').createSignedUrl(doc.arquivo_path, 120)); window.open(signedUrl, '_blank', 'noopener'); }
        catch (e) { erro(e); }
      } }, 'Baixar PDF registrado') : null,
      h('a', { class: 'btn dir', href: 'documentos.html' }, 'Todos os documentos')),
    situacaoArquivo);

  if (podeEscrever && !doc.cancelado && !doc.arquivo_assinado) {
    const arq = h('input', { type: 'file', accept: 'application/pdf' });
    const assinado = h('input', { type: 'checkbox', checked: true, style: { width: 'auto' } });
    const enviar = h('button', { class: 'btn verde' }, 'Registrar PDF');
    enviar.addEventListener('click', async () => {
      const f = arq.files[0];
      if (!f) return avisar('Escolha o arquivo PDF.', 'alerta');
      if (f.type !== 'application/pdf' || f.size > 10 * 1024 * 1024) return avisar('Envie um PDF de até 10 MB.', 'alerta');
      enviar.disabled = true;
      try {
        const hash = await sha256Arquivo(f);
        const caminho = `${doc.gabinete_id}/${doc.id}-${Date.now()}.pdf`;
        await q(sb.storage.from('documentos').upload(caminho, f, { contentType: 'application/pdf', upsert: false }));
        await q(sb.rpc('registrar_arquivo', { p_doc: doc.id, p_hash: hash, p_nome: f.name, p_path: caminho, p_assinado: assinado.checked }));
        avisar('PDF registrado. A página de verificação já confere este arquivo.');
        setTimeout(() => location.reload(), 900);
      } catch (e) { erro(e); enviar.disabled = false; }
    });
    painel.append(h('details', { class: 'cartao', open: !doc.arquivo_hash },
      h('summary', null, h('strong', null, 'Assinar com gov.br e registrar o PDF final')),
      h('ol', { class: 'passos' },
        h('li', null, 'Clique em “Imprimir / Salvar PDF” e salve o documento como PDF.'),
        h('li', null, 'Assine o PDF no ', h('a', { href: 'https://assinador.iti.br', target: '_blank', rel: 'noopener noreferrer' }, 'Assinador gov.br'), ' (conta prata ou ouro) — ou no SEI/sistema da Casa.'),
        h('li', null, 'Envie aqui o PDF assinado. O sistema guarda o arquivo e a impressão digital (SHA-256) para conferência.')),
      h('label', { class: 'campo' }, 'Arquivo PDF', arq),
      h('label', { class: 'campo linha-check' }, assinado, 'Este PDF está assinado digitalmente (gov.br ou ICP-Brasil)'),
      enviar,
      h('p', { class: 'sub', style: { marginTop: '8px' } }, 'Um PDF marcado como assinado não pode ser substituído depois.')));
  }
  if (g.papel === 'admin' && !doc.cancelado) {
    painel.append(h('p', { style: { marginTop: '8px' } }, h('button', { class: 'btn peq perigo', onclick: () => abrirFormulario({
      titulo: `Cancelar documento ${doc.numero}`, rotuloSalvar: 'Cancelar documento',
      campos: [{ nome: 'motivo', rotulo: 'Motivo do cancelamento', tipo: 'textarea', obrigatorio: true, max: 500 }],
      aoSalvar: async (v) => { await q(sb.rpc('cancelar_documento', { p_doc: doc.id, p_motivo: v.motivo })); location.reload(); },
    }) }, 'Cancelar documento')));
  }
  main.append(painel, folha);
}

try {
  if (params.get('doc')) await modoEmitido(params.get('doc'));
  else await modoRascunho();
} catch (e) { erro(e); }
