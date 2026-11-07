// Tela inicial: login com Google, escolha de gabinete e painel geral.
import { sb, h, q, limpar, erro, entrarComGoogle, sair, sessaoAtual, carregarContexto, montarLayout,
  diasAte, hojeISO, pct } from './lib.js';
import { NOME_SISTEMA } from '../config.js';

const app = document.getElementById('app');

function telaLogin() {
  limpar(app).append(h('div', { class: 'tela-login' },
    h('div', { class: 'cartao' },
      h('h1', null, NOME_SISTEMA),
      h('p', { class: 'sub' }, 'Gestão de demandas, planejamento, emendas, projetos, comunicação, captação e proposições do gabinete.'),
      h('button', { class: 'btn-google', onclick: entrarComGoogle },
        h('span', { 'aria-hidden': 'true', style: { fontWeight: 700, color: '#4285F4' } }, 'G'), 'Entrar com Google'),
      h('p', { class: 'sub', style: { marginTop: '20px', fontSize: '.82rem' } },
        'O acesso é liberado pelo administrador do seu gabinete, pelo seu e-mail Google.'),
      h('p', { style: { fontSize: '.82rem' } }, h('a', { href: 'verificar.html' }, 'Verificar a autenticidade de um documento')))));
}

function telaSemGabinete(email, adminPlataforma) {
  limpar(app).append(h('div', { class: 'tela-login' },
    h('div', { class: 'cartao' },
      h('h1', null, 'Acesso não liberado'),
      h('p', null, `O e-mail ${email} ainda não está cadastrado em nenhum gabinete ativo.`),
      h('p', { class: 'sub' }, 'Peça ao administrador do seu gabinete para incluir este e-mail em Administração → Membros.'),
      adminPlataforma ? h('p', null, h('a', { class: 'btn primario', href: 'plataforma.html' }, 'Abrir administração da plataforma')) : null,
      h('button', { class: 'btn', onclick: sair }, 'Sair'))));
}

const contar = (r) => (r && typeof r.count === 'number' ? r.count : 0);

async function painel(ctx) {
  const main = montarLayout(ctx, 'index.html');
  const g = ctx.gab.id;
  main.append(h('h1', null, ctx.gab.nome), h('p', { class: 'sub' }, [ctx.gab.parlamentar, ctx.gab.casa_legislativa].filter(Boolean).join(' · ')));
  const grade = h('div', { class: 'grade-cartoes' }, h('p', { class: 'sub' }, 'Carregando indicadores…'));
  main.append(grade);

  const hoje = hojeISO();
  const cnt = (tabela, filtro) => {
    let c = sb.from(tabela).select('id', { count: 'exact', head: true }).eq('gabinete_id', g).eq('arquivado', false);
    return filtro ? filtro(c) : c;
  };
  try {
    const [abertas, atrasadas, emPend, oport, props, krs] = await Promise.all([
      cnt('demandas', (c) => c.in('status', ['a_fazer', 'em_andamento'])),
      cnt('demandas', (c) => c.in('status', ['a_fazer', 'em_andamento']).lt('prazo', hoje)),
      cnt('emendas', (c) => c.eq('status', 'Pendente')),
      q(sb.from('oportunidades').select('prazo_inscricao').eq('gabinete_id', g).eq('arquivado', false).gte('prazo_inscricao', hoje)),
      q(sb.from('proposicoes').select('prazo_final, status').eq('gabinete_id', g).eq('arquivado', false)),
      q(sb.from('okr_krs').select('meta, atual').eq('gabinete_id', g).eq('arquivado', false)),
    ]);
    const vencidas = props.filter((p) => p.prazo_final && p.prazo_final < hoje && !['Respondido', 'Aprovado', 'Rejeitado', 'Arquivado'].includes(p.status)).length;
    const urgentes = oport.filter((o) => diasAte(o.prazo_inscricao) <= 7).length;
    const progresso = krs.length ? Math.round(krs.reduce((s, k) => s + pct(k.atual, k.meta), 0) / krs.length) : null;
    const card = (href, valor, rotulo, cor) => h('a', { class: `cartao indicador ${cor || ''}`, href },
      h('div', { class: 'valor' }, valor), h('div', { class: 'rot' }, rotulo));
    limpar(grade).append(
      card('demandas.html', contar(abertas), 'demandas abertas'),
      card('demandas.html', contar(atrasadas), 'demandas com prazo vencido', contar(atrasadas) ? 'vermelho' : 'verde'),
      card('okrs.html', progresso === null ? '—' : `${progresso}%`, 'progresso médio dos OKRs'),
      card('emendas.html', contar(emPend), 'emendas com documentação pendente'),
      card('captacao.html', urgentes, 'editais fecham em até 7 dias', urgentes ? 'vermelho' : ''),
      card('proposicoes.html', vencidas, 'pedidos com prazo de resposta vencido', vencidas ? 'vermelho' : 'verde'));
  } catch (e) { erro(e); }

  main.append(h('h2', null, 'Atalhos'), h('div', { class: 'acoes' },
    h('a', { class: 'btn primario', href: 'demandas.html?nova=1' }, '+ Nova demanda'),
    h('a', { class: 'btn', href: 'documentos.html' }, 'Documentos emitidos'),
    h('a', { class: 'btn', href: 'verificar.html' }, 'Verificar documento')));
}

async function iniciar() {
  try {
    const sessao = await sessaoAtual();
    if (!sessao) return telaLogin();
    const ctx = await carregarContexto({ exigirGabinete: false });
    if (!ctx.gab) return telaSemGabinete(ctx.email, ctx.adminPlataforma);
    await painel(ctx);
  } catch (e) {
    erro(e);
    telaLogin();
  }
}
// getSession() já conclui o retorno do login Google (troca do código PKCE) antes de responder.
iniciar();
