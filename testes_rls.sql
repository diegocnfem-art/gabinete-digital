\set ON_ERROR_STOP 1
\pset pager off
set client_min_messages = warning;

-- Utilitários de teste (invoker: rodam com o papel corrente)
create or replace function public.t_ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create or replace function public.t_erro(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (erro esperado: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FALHOU (deveria dar erro): %', msg;
end $$;
create or replace function public.t_linhas(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || sql || ') x' into n;
  return n;
end $$;
grant execute on function t_ok(boolean, text), t_erro(text, text), t_linhas(text) to anon, authenticated;
set client_min_messages = notice;

-- ====== Admin da plataforma cria dois gabinetes ======
set role authenticated;
set request.jwt.claims = '{"email":"jhennifernalin@gmail.com"}';
select t_ok(eh_admin_plataforma(), 'Jhenni é admin da plataforma');
select id as gab_a from criar_gabinete('Gabinete Alfa', 'GAB-ALFA', 'Dep. Alfa', 'ALE-RO', 'a@x.com', 'pro') \gset
select id as gab_b from criar_gabinete('Gabinete Beta', 'GAB-BETA', 'Dep. Beta', 'ALE-RO', 'b@x.com', 'pro') \gset
select t_ok(t_linhas('select * from demandas') = 0, 'Admin da plataforma NÃO lê demandas de gabinetes (não é membro)');
select t_erro($$insert into gabinetes (nome) values ('Direto')$$, 'Ninguém cria gabinete por insert direto');

-- ====== Admin do gabinete A ======
set request.jwt.claims = '{"email":"a@x.com"}';
select t_ok(t_linhas('select * from meus_gabinetes()') = 1, 'Admin A vê só o próprio gabinete');
insert into demandas (gabinete_id, solicitante, descricao, prioridade, prazo)
  values (:'gab_a', 'Maria Silva', 'Pede iluminação na rua 7', 'alta', current_date - 1) returning id as dem1 \gset
insert into demandas (gabinete_id, solicitante, descricao, dado_sensivel)
  values (:'gab_a', 'João Souza', 'Caso de saúde - medicamento', true);
select t_ok((select criado_por from demandas where id = :'dem1') = 'a@x.com', 'Autoria carimbada pelo servidor');
select t_erro(format($$insert into demandas (gabinete_id, solicitante, descricao) values (%L, 'X', 'invasão')$$, :'gab_b'),
  'A não grava no gabinete B');
insert into membros (gabinete_id, email, papel) values (:'gab_a', 'L@X.com', 'leitura'), (:'gab_a', 's@x.com', 'assessor');
select t_ok(exists(select 1 from membros where email = 'l@x.com'), 'E-mail do membro salvo em minúsculas');
update demandas set status = 'em_andamento' where id = :'dem1';
update demandas set status = 'concluido', resposta = 'Encaminhado à SEOSP' where id = :'dem1';
select t_ok(t_linhas('select * from auditoria where registro_id = ''' || :'dem1' || '''') = 3, 'Trilha registrou criação + 2 mudanças de status');
select t_ok((select integra from verificar_cadeia(:'gab_a')), 'Cadeia de hash íntegra');
select t_erro(format('delete from demandas where id = %L', :'dem1'), 'Ninguém apaga registros pela API');
select t_ok(t_linhas('select * from demandas where id = ''' || :'dem1' || '''') = 1, 'DELETE não apaga nada');
select t_erro(format($$update demandas set gabinete_id = %L where id = %L$$, :'gab_b', :'dem1'), 'Não muda gabinete de um registro');
select t_erro(format($$update gabinetes set plano = 'demo' where id = %L$$, :'gab_a'), 'Admin do gabinete não muda o plano');
update gabinetes set cabecalho = array['ALE-RO', 'Gabinete Alfa'], assinatura_nome = 'Dep. Alfa' where id = :'gab_a';
select t_ok((select assinatura_nome from gabinetes where id = :'gab_a') = 'Dep. Alfa', 'Admin do gabinete edita identidade visual');
select t_erro(format($$update membros set ativo = false where gabinete_id = %L and email = 'a@x.com'$$, :'gab_a'),
  'Não deixa o gabinete sem administrador');
select t_erro('insert into auditoria (gabinete_id, tabela, acao, usuario, em, hash) values (gen_random_uuid(), ''x'', ''x'', ''x'', now(), ''x'')',
  'Ninguém grava na trilha diretamente');

-- OKRs
insert into okr_objetivos (gabinete_id, titulo) values (:'gab_a', 'Melhorar a comunicação') returning id as obj \gset
insert into okr_krs (gabinete_id, objetivo_id, descricao, meta, unidade)
  select :'gab_a', :'obj', 'KR ' || g, 10, 'visitas' from generate_series(1, 5) g;
select t_erro(format($$insert into okr_krs (gabinete_id, objetivo_id, descricao, meta) values (%L, %L, 'KR 6', 1)$$, :'gab_a', :'obj'),
  'Máximo de 5 KRs por objetivo');
select id as kr1 from okr_krs where descricao = 'KR 1' \gset
insert into okr_lancamentos (gabinete_id, kr_id, valor) values (:'gab_a', :'kr1', 4);
select t_ok((select atual from okr_krs where id = :'kr1') = 4, 'Lançamento atualiza o valor atual do KR');
select t_erro('update okr_lancamentos set valor = 9', 'Lançamento de progresso não pode ser alterado');
reset role;
insert into membros (gabinete_id, email, papel) values (:'gab_b', 'a@x.com', 'assessor');
set role authenticated;
insert into okr_objetivos (gabinete_id, titulo) values (:'gab_a', 'Objetivo novo') returning id as obj2 \gset
select t_erro(format($$insert into okr_krs (gabinete_id, objetivo_id, descricao, meta) values (%L, %L, 'KR cruzado', 1)$$, :'gab_b', :'obj2'),
  'Mesmo membro de 2 gabinetes não liga KR de B a objetivo de A');
reset role;
update membros set ativo = false where gabinete_id = :'gab_b' and email = 'a@x.com';
set role authenticated;

-- Emendas
insert into emendas (gabinete_id, numero, objeto, valor, checklist) values
  (:'gab_a', '001/2027', 'Reforma de escola', 150000, '{"justificativa":"sim","plano_trabalho":"sim","compatibilidade":"sim","doc_proponente":"sim"}'),
  (:'gab_a', '002/2027', 'Ambulância', 300000, '{"justificativa":"sim","plano_trabalho":"nao","compatibilidade":"sim"}'),
  (:'gab_a', '003/2027', 'Ponte', 900000, '{"justificativa":"sim","compatibilidade":"nao"}');
select t_ok((select string_agg(status, ',' order by numero) from emendas) = 'Elegível,Pendente,Inabilitada', 'Status das emendas calculado no servidor');
update emendas set status = 'Elegível' where numero = '003/2027';
select t_ok((select status from emendas where numero = '003/2027') = 'Inabilitada', 'Status não pode ser forçado manualmente');

-- Proposições
insert into proposicoes (gabinete_id, numero, tipo, ementa, data_apresentacao, prazo_dias, orgao_destino)
  values (:'gab_a', '12/2027', 'Pedido de Informação', 'Informações sobre obras', '2027-01-10', 30, 'SEOSP');
select t_ok((select prazo_final from proposicoes where numero = '12/2027') = '2027-02-09', 'Prazo final calculado (data + 30 dias)');

-- Documentos
select id as doc1, numero as num1, codigo as cod1 from emitir_documento(:'gab_a', 'oficio_resposta', 'Resposta', '<p>Conteúdo do ofício 1</p>', 'demandas', :'dem1') \gset
select numero as num2 from emitir_documento(:'gab_a', 'oficio_cobranca', 'Cobrança', '<p>Conteúdo do ofício 2</p>') \gset
select numero as num3 from emitir_documento(:'gab_a', 'checklist_emenda', 'Checklist', '<p>Checklist da emenda</p>') \gset
select t_ok(:'num1' like '1/%/GAB-ALFA' and :'num2' like '2/%/GAB-ALFA' and :'num3' like '1/%/GAB-ALFA',
  'Numeração: ofícios compartilham série (1, 2); checklist tem a sua (1)');
select t_ok(:'cod1' ~ '^[0-9A-F]{5}(-[0-9A-F]{5}){3}$', 'Código de verificação no formato XXXXX-XXXXX-XXXXX-XXXXX');
select t_erro(format($$select emitir_documento(%L, 'oficio', 'x', '<p>invasão no B</p>')$$, :'gab_b'), 'A não emite documento no gabinete B');
select t_erro(format($$select registrar_arquivo(%L, 'abc', 'x.pdf', null, true)$$, :'doc1'), 'Hash inválido é recusado');
select t_erro(format($$select registrar_arquivo(%L, %L, 'x.pdf', %L, true)$$, :'doc1', repeat('a', 64), :'gab_b' || '/x.pdf'), 'Caminho de outro gabinete é recusado');
select registrar_arquivo(:'doc1', repeat('a', 64), 'oficio-assinado.pdf', :'gab_a' || '/' || :'doc1' || '.pdf', true);
select t_erro(format($$select registrar_arquivo(%L, %L, 'outro.pdf', null, true)$$, :'doc1', repeat('b', 64)), 'PDF assinado não pode ser substituído');
select t_erro('update documentos set titulo = ''alterado''', 'Documento não é alterado diretamente');
-- Storage
insert into storage.objects (bucket_id, name) values ('documentos', :'gab_a' || '/teste.pdf');
select t_erro(format($$insert into storage.objects (bucket_id, name) values ('documentos', %L)$$, :'gab_b' || '/x.pdf'), 'A não envia PDF para a pasta de B');
select t_erro($$insert into storage.objects (bucket_id, name) values ('documentos', 'nao-e-uuid/x.pdf')$$, 'Pasta inválida é recusada');

-- ====== Membro "leitura" ======
set request.jwt.claims = '{"email":"l@x.com"}';
select t_ok(t_linhas('select * from demandas') = 1, 'Leitura vê só a demanda não sensível');
select t_erro(format($$insert into demandas (gabinete_id, solicitante, descricao) values (%L, 'X', 'tentativa')$$, :'gab_a'), 'Leitura não grava');
select t_ok(t_linhas('select * from auditoria') = 0, 'Leitura não vê a trilha (pode conter dados sensíveis)');
select t_erro(format($$select verificar_cadeia(%L)$$, :'gab_a'), 'Só admin confere a cadeia');

-- ====== Assessor ======
set request.jwt.claims = '{"email":"s@x.com"}';
select t_ok(t_linhas('select * from demandas') = 2, 'Assessor vê demandas sensíveis');
select t_erro(format($$insert into membros (gabinete_id, email) values (%L, 'novo@x.com')$$, :'gab_a'), 'Assessor não cadastra membros');
select t_erro(format($$select cancelar_documento(%L, 'x')$$, :'doc1'), 'Assessor não cancela documento');

-- ====== Admin do gabinete B não enxerga A ======
set request.jwt.claims = '{"email":"b@x.com"}';
select t_ok(t_linhas('select * from demandas') + t_linhas('select * from emendas') + t_linhas('select * from documentos')
  + t_linhas(format('select * from auditoria where gabinete_id = %L', :'gab_a')) + t_linhas('select * from okr_krs') = 0, 'Gabinete B não vê nada de A');
select t_ok(t_linhas(format('select * from membros where gabinete_id = %L', :'gab_a')) = 0, 'B não vê os membros de A');
select t_erro(format($$select registrar_arquivo(%L, %L, 'x.pdf', null, false)$$, :'doc1', repeat('c', 64)), 'B não registra arquivo em documento de A');

-- ====== Usuário sem cadastro ======
set request.jwt.claims = '{"email":"estranho@x.com"}';
select t_ok(t_linhas('select * from meus_gabinetes()') + t_linhas('select * from gabinetes') + t_linhas('select * from membros') = 0,
  'E-mail sem cadastro não vê nada');

-- ====== Visitante (anon): só verificação ======
set role anon;
set request.jwt.claims = '{}';
select t_ok((select numero from verificar_documento(:'cod1')) = :'num1', 'Verificação pública por código funciona');
select t_ok((select numero from verificar_documento(lower(:'cod1') || ' ')) = :'num1', 'Código aceita minúsculas e espaços');
select t_ok((select arquivo_assinado from verificar_documento(:'cod1')), 'Verificação mostra que há PDF assinado');
select t_ok(t_linhas($$select * from verificar_documento('00000-00000-00000-00000')$$) = 0, 'Código inexistente não retorna nada');
select t_erro('select * from documentos', 'Visitante não lê a tabela de documentos');
select t_erro('select * from meus_gabinetes()', 'Visitante não chama funções internas');

-- ====== Suspensão do gabinete ======
set role authenticated;
set request.jwt.claims = '{"email":"jhennifernalin@gmail.com"}';
update gabinetes set situacao = 'suspenso' where id = :'gab_a';
set request.jwt.claims = '{"email":"a@x.com"}';
select t_ok(t_linhas('select * from demandas') = 2, 'Gabinete suspenso ainda lê (para exportar)');
select t_erro(format($$insert into demandas (gabinete_id, solicitante, descricao) values (%L, 'X', 'após suspensão')$$, :'gab_a'), 'Gabinete suspenso não grava');

-- ====== Adulteração da trilha é detectada ======
reset role;
update auditoria set usuario = 'adulterado' where id = (select id from auditoria where gabinete_id = :'gab_a' order by id offset 2 limit 1);
set role authenticated;
set request.jwt.claims = '{"email":"a@x.com"}';
select t_ok(not (select integra from verificar_cadeia(:'gab_a')), 'Adulteração manual da trilha é detectada');
\echo TODOS_OS_TESTES_PASSARAM
