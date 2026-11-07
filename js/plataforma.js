// Administração da plataforma (sócios): criar, suspender e configurar gabinetes.
// Por privacidade, quem administra a plataforma NÃO vê os dados dos módulos dos gabinetes.
import { sb, h, q, limpar, erro, avisar, carregarContexto, montarLayout, abrirFormulario, fmtData, etiqueta, parar } from './lib.js';

const ctx = await carregarContexto({ exigirGabinete: false });
const main = montarLayout(ctx, 'plataforma.html');
main.append(h('h1', null, 'Administração da plataforma'),
  h('p', { class: 'sub' }, 'Cadastro de gabinetes clientes. Os dados internos de cada gabinete só são vistos pelos membros dele.'));
if (!ctx.adminPlataforma) {
  main.append(h('div', { class: 'aviso erro' }, 'Acesso restrito à administração da plataforma.'));
  await parar();
}
const area = h('div');
main.append(h('div', { class: 'acoes' }, h('button', { class: 'btn primario', onclick: novo }, '+ Novo gabinete')), area);
const COR = { ativo: 'verde', suspenso: 'amarelo', encerrado: 'vermelho' };

async function carregar() {
  limpar(area);
  try {
    const [gs, ms] = await Promise.all([
      q(sb.from('gabinetes').select('*').order('nome')),
      q(sb.from('membros').select('gabinete_id, email, papel, ativo').eq('papel', 'admin').eq('ativo', true)),
    ]);
    area.append(h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Gabinete', 'Sigla', 'Casa', 'Administradores', 'Plano', 'Situação', 'Criado', ''].map((t) => h('th', null, t)))),
      h('tbody', null, gs.map((g) => h('tr', null,
        h('td', null, h('strong', null, g.nome), h('br'), h('small', null, g.parlamentar || '')), h('td', null, g.sigla), h('td', null, g.casa_legislativa || '—'),
        h('td', null, ms.filter((m) => m.gabinete_id === g.id).map((m) => h('div', null, h('small', null, m.email)))),
        h('td', null, etiqueta(g.plano, g.plano === 'pro' ? 'azul' : 'amarelo')), h('td', null, etiqueta(g.situacao, COR[g.situacao])),
        h('td', null, fmtData(g.criado_em)),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('button', { class: 'btn peq', onclick: () => editar(g) }, 'Configurar'), ' ',
          h('button', { class: 'btn peq', onclick: () => novoAdmin(g) }, '+ admin')))))));
  } catch (e) { erro(e); }
}

function novo() {
  abrirFormulario({
    titulo: 'Novo gabinete', valores: { plano: 'demo' },
    campos: [
      { nome: 'nome', rotulo: 'Nome do gabinete', obrigatorio: true },
      { nome: 'sigla', rotulo: 'Sigla (usada na numeração)', obrigatorio: true, ajuda: 'letras maiúsculas, números e hífen — ex.: GAB-DEP-FULANO', largura: 'meia' },
      { nome: 'plano', rotulo: 'Plano', tipo: 'select', opcoes: [['demo', 'Demonstração (curso)'], ['pro', 'Pro (dados reais)']], largura: 'meia' },
      { nome: 'parlamentar', rotulo: 'Parlamentar', largura: 'meia' },
      { nome: 'casa', rotulo: 'Casa legislativa', largura: 'meia' },
      { nome: 'email_admin', rotulo: 'E-mail Google do primeiro administrador', tipo: 'email', obrigatorio: true },
    ],
    aoSalvar: async (v) => {
      if (!/^[A-Z0-9-]{2,30}$/.test((v.sigla || '').toUpperCase())) throw new Error('Sigla inválida: use de 2 a 30 letras maiúsculas, números ou hífen.');
      await q(sb.rpc('criar_gabinete', { p_nome: v.nome, p_sigla: v.sigla.toUpperCase(), p_parlamentar: v.parlamentar, p_casa: v.casa,
        p_email_admin: v.email_admin, p_plano: v.plano }));
      avisar('Gabinete criado. O administrador já pode entrar com a conta Google.'); carregar();
    },
  });
}

function editar(g) {
  abrirFormulario({
    titulo: g.nome, valores: g,
    campos: [
      { nome: 'sigla', rotulo: 'Sigla', obrigatorio: true, largura: 'meia' },
      { nome: 'plano', rotulo: 'Plano', tipo: 'select', opcoes: [['demo', 'Demonstração'], ['pro', 'Pro']], largura: 'meia' },
      { nome: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: [['ativo', 'Ativo'], ['suspenso', 'Suspenso (só leitura e exportação)'], ['encerrado', 'Encerrado (sem acesso)']] },
    ],
    extra: h('div', { class: 'aviso alerta' }, 'Antes de encerrar, garanta que o gabinete exportou os dados (Administração → Exportar).'),
    aoSalvar: async (v) => { await q(sb.from('gabinetes').update({ sigla: v.sigla.toUpperCase(), plano: v.plano, situacao: v.situacao }).eq('id', g.id)); avisar('Gabinete atualizado.'); carregar(); },
  });
}

function novoAdmin(g) {
  abrirFormulario({
    titulo: `Novo administrador — ${g.nome}`,
    campos: [{ nome: 'email', rotulo: 'E-mail Google', tipo: 'email', obrigatorio: true }],
    aoSalvar: async (v) => { await q(sb.from('membros').insert({ gabinete_id: g.id, email: v.email.toLowerCase(), papel: 'admin' })); avisar('Administrador incluído.'); carregar(); },
  });
}

await carregar();
