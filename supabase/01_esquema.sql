-- =====================================================================
-- GABINETE DIGITAL — Esquema do banco (Supabase / PostgreSQL)
-- Rode este arquivo inteiro no SQL Editor do Supabase, uma única vez.
-- Depois rode 02_primeiro_acesso.sql com o seu e-mail.
--
-- Princípios:
--   * Todo dado pertence a um gabinete (coluna gabinete_id).
--   * Quem pode ler/gravar é decidido AQUI (Row Level Security), nunca no navegador.
--   * Nada é apagado: registros são arquivados (arquivado = true).
--   * Toda alteração vai para a trilha de auditoria, com hash encadeado.
--   * Documentos só são emitidos por função, com número e código de verificação.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. NÚCLEO: gabinetes, membros, administradores da plataforma
-- ---------------------------------------------------------------------

create type papel_membro as enum ('admin', 'assessor', 'leitura');

create table gabinetes (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null check (char_length(nome) between 2 and 200),
  sigla            text not null default 'GAB' check (sigla ~ '^[A-Z0-9-]{2,30}$'),
  parlamentar      text check (char_length(parlamentar) <= 200),
  casa_legislativa text check (char_length(casa_legislativa) <= 200),
  cabecalho        text[] not null default '{}',
  brasao_url       text check (brasao_url is null or brasao_url ~ '^https://'),
  assinatura_nome  text check (char_length(assinatura_nome) <= 200),
  assinatura_cargo text check (char_length(assinatura_cargo) <= 200),
  plano            text not null default 'demo' check (plano in ('demo', 'pro')),
  situacao         text not null default 'ativo' check (situacao in ('ativo', 'suspenso', 'encerrado')),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table membros (
  id            uuid primary key default gen_random_uuid(),
  gabinete_id   uuid not null references gabinetes(id),
  email         text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nome          text check (char_length(nome) <= 200),
  papel         papel_membro not null default 'assessor',
  ativo         boolean not null default true,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (gabinete_id, email)
);
create index membros_email_idx on membros (email) where ativo;

-- Administradores da plataforma (os sócios). Gerenciado só pelo SQL Editor.
create table admins_plataforma (
  email         text primary key check (email = lower(email)),
  adicionado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES DE ACESSO (usadas pelas políticas RLS)
-- ---------------------------------------------------------------------

create or replace function email_atual() returns text
language sql stable
set search_path = public
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function eh_admin_plataforma() returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from admins_plataforma where email = email_atual() and email <> '') $$;

create or replace function papel_no_gabinete(g uuid) returns papel_membro
language sql stable security definer
set search_path = public
as $$
  select m.papel from membros m
   where m.gabinete_id = g and m.email = email_atual() and m.ativo
   limit 1
$$;

-- Ler: qualquer membro ativo (mesmo com gabinete suspenso, para poder exportar).
create or replace function pode_ler(g uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(papel_no_gabinete(g) is not null
     and exists (select 1 from gabinetes where id = g and situacao <> 'encerrado'), false)
$$;

-- Gravar: admin ou assessor, com gabinete ativo.
create or replace function pode_escrever(g uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(papel_no_gabinete(g) in ('admin', 'assessor')
     and exists (select 1 from gabinetes where id = g and situacao = 'ativo'), false)
$$;

create or replace function eh_admin_gabinete(g uuid) returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(papel_no_gabinete(g) = 'admin', false) $$;

create or replace function uuid_ou_nulo(t text) returns uuid
language plpgsql immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 3. TRIGGERS GENÉRICOS: carimbo de autoria e trilha de auditoria
-- ---------------------------------------------------------------------

-- Carimbo: autoria e datas são do servidor; gabinete_id não muda depois de criado.
create or replace function trg_carimbo() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(nullif(email_atual(), ''), 'sistema');
    new.criado_em := now();
    new.atualizado_em := now();
  else
    if new.gabinete_id is distinct from old.gabinete_id then
      raise exception 'Não é permitido mudar o gabinete de um registro.';
    end if;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
  end if;
  return new;
end $$;

create table auditoria (
  id            bigint generated always as identity primary key,
  gabinete_id   uuid not null,
  tabela        text not null,
  registro_id   uuid,
  acao          text not null,
  usuario       text not null,
  em            timestamptz not null,
  antes         jsonb,
  depois        jsonb,
  hash_anterior text,
  hash          text not null
);
create index auditoria_gab_idx on auditoria (gabinete_id, id);
create index auditoria_reg_idx on auditoria (registro_id);

-- Texto canônico de um registro da trilha (o mesmo usado para conferir a cadeia).
create or replace function auditoria_texto(
  p_anterior text, p_gab uuid, p_tabela text, p_reg uuid, p_acao text,
  p_usuario text, p_em timestamptz, p_antes jsonb, p_depois jsonb
) returns text
language sql immutable
as $$
  select concat_ws('|',
    coalesce(p_anterior, 'INICIO'), p_gab::text, p_tabela, coalesce(p_reg::text, ''), p_acao, p_usuario,
    to_char(p_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    coalesce(p_antes::text, ''), coalesce(p_depois::text, ''))
$$;

-- TG_ARGV[0] = nome da coluna que contém o gabinete (padrão: gabinete_id).
create or replace function trg_auditoria() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_col     text := coalesce(tg_argv[0], 'gabinete_id');
  v_linha   jsonb;
  v_gab     uuid;
  v_reg     uuid;
  v_ant     text;
  v_em      timestamptz := clock_timestamp();
  v_usuario text := coalesce(nullif(email_atual(), ''), 'sistema');
  v_antes   jsonb;
  v_depois  jsonb;
begin
  if tg_op = 'DELETE' then v_linha := to_jsonb(old); else v_linha := to_jsonb(new); end if;
  v_gab := (v_linha ->> v_col)::uuid;
  v_reg := (v_linha ->> 'id')::uuid;
  if tg_op <> 'INSERT' then v_antes := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_depois := to_jsonb(new); end if;

  -- Uma gravação por gabinete de cada vez, para a cadeia não se bifurcar.
  perform pg_advisory_xact_lock(hashtextextended(v_gab::text, 0));
  select a.hash into v_ant from auditoria a where a.gabinete_id = v_gab order by a.id desc limit 1;

  insert into auditoria (gabinete_id, tabela, registro_id, acao, usuario, em, antes, depois, hash_anterior, hash)
  values (v_gab, tg_table_name, v_reg, tg_op, v_usuario, v_em, v_antes, v_depois, v_ant,
          encode(extensions.digest(
            auditoria_texto(v_ant, v_gab, tg_table_name, v_reg, tg_op, v_usuario, v_em, v_antes, v_depois),
            'sha256'), 'hex'));
  return null;
end $$;

-- Confere se ninguém alterou a trilha direto no banco.
create or replace function verificar_cadeia(p_gab uuid)
returns table (total bigint, integra boolean, primeiro_erro bigint)
language plpgsql stable security definer
set search_path = public
as $$
declare
  r       record;
  v_ant   text := null;
  v_n     bigint := 0;
  v_calc  text;
begin
  if eh_admin_gabinete(p_gab) is not true then
    raise exception 'Apenas o administrador do gabinete pode conferir a trilha.';
  end if;
  for r in select * from auditoria where gabinete_id = p_gab order by id loop
    v_n := v_n + 1;
    v_calc := encode(extensions.digest(
      auditoria_texto(v_ant, r.gabinete_id, r.tabela, r.registro_id, r.acao, r.usuario, r.em, r.antes, r.depois),
      'sha256'), 'hex');
    if r.hash_anterior is distinct from v_ant or r.hash <> v_calc then
      return query select v_n, false, r.id;
      return;
    end if;
    v_ant := r.hash;
  end loop;
  return query select v_n, true, null::bigint;
end $$;

-- Regras de proteção do núcleo
create or replace function trg_gabinete_protegido() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  new.criado_em := old.criado_em;
  if eh_admin_plataforma() is not true and (
       new.plano is distinct from old.plano or
       new.situacao is distinct from old.situacao or
       new.sigla is distinct from old.sigla) then
    raise exception 'Plano, situação e sigla só podem ser alterados pela administração da plataforma.';
  end if;
  return new;
end $$;

create or replace function trg_membro_regras() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(nullif(email_atual(), ''), 'sistema');
    new.criado_em := now();
  else
    if new.gabinete_id is distinct from old.gabinete_id or new.email is distinct from old.email then
      raise exception 'Para trocar e-mail ou gabinete, desative este acesso e crie outro.';
    end if;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    -- O gabinete não pode ficar sem nenhum administrador ativo.
    if old.papel = 'admin' and old.ativo and (new.papel <> 'admin' or not new.ativo)
       and not exists (select 1 from membros m where m.gabinete_id = old.gabinete_id
                        and m.id <> old.id and m.papel = 'admin' and m.ativo) then
      raise exception 'O gabinete precisa de pelo menos um administrador ativo.';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger gabinetes_protecao before update on gabinetes
  for each row execute function trg_gabinete_protegido();
create trigger gabinetes_auditoria after insert or update or delete on gabinetes
  for each row execute function trg_auditoria('id');

create trigger membros_regras before insert or update on membros
  for each row execute function trg_membro_regras();
create trigger membros_auditoria after insert or update or delete on membros
  for each row execute function trg_auditoria('gabinete_id');

-- ---------------------------------------------------------------------
-- 4. MÓDULOS
-- Colunas comuns: id, gabinete_id, criado_por, criado_em, atualizado_em, arquivado
-- ---------------------------------------------------------------------

-- Módulo 1 — OKRs
create table okr_objetivos (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  titulo text not null check (char_length(titulo) between 3 and 300),
  descricao text check (char_length(descricao) <= 2000),
  ciclo text check (char_length(ciclo) <= 60),
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false,
  unique (id, gabinete_id)
);

create table okr_krs (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null,
  objetivo_id uuid not null,
  descricao text not null check (char_length(descricao) between 3 and 300),
  meta numeric not null check (meta > 0),
  atual numeric not null default 0 check (atual >= 0),
  unidade text check (char_length(unidade) <= 40),
  prazo date,
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false,
  unique (id, gabinete_id),
  foreign key (objetivo_id, gabinete_id) references okr_objetivos (id, gabinete_id)
);

-- Lançamentos de progresso: histórico, nunca alterado.
create table okr_lancamentos (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null,
  kr_id uuid not null,
  valor numeric not null check (valor >= 0),
  observacao text check (char_length(observacao) <= 500),
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false,
  foreign key (kr_id, gabinete_id) references okr_krs (id, gabinete_id)
);

-- Limite de 5 KRs ativos por objetivo (regra do escopo)
create or replace function trg_limite_krs() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.arquivado and (select count(*) from okr_krs
        where objetivo_id = new.objetivo_id and not arquivado and id <> new.id) >= 5 then
    raise exception 'Cada objetivo pode ter no máximo 5 resultados-chave ativos.';
  end if;
  return new;
end $$;
create trigger okr_krs_limite before insert or update on okr_krs
  for each row execute function trg_limite_krs();

-- Ao lançar progresso, o valor atual do KR é atualizado.
create or replace function trg_lancamento_atualiza_kr() returns trigger
language plpgsql
set search_path = public
as $$
begin
  update okr_krs set atual = new.valor where id = new.kr_id and gabinete_id = new.gabinete_id;
  return null;
end $$;

-- Módulo 2 — Emendas
create table emendas (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  numero text not null check (char_length(numero) between 1 and 60),
  objeto text not null check (char_length(objeto) between 3 and 1000),
  valor numeric(14,2) not null default 0 check (valor >= 0),
  orgao_destino text check (char_length(orgao_destino) <= 200),
  autor text check (char_length(autor) <= 200),
  checklist jsonb not null default '{}'::jsonb,
  status text not null default 'Pendente' check (status in ('Elegível', 'Pendente', 'Inabilitada')),
  observacoes text check (char_length(observacoes) <= 2000),
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false
);

-- Status calculado pelo servidor (o sistema sinaliza; a decisão final é humana).
create or replace function trg_emenda_status() returns trigger
language plpgsql
set search_path = public
as $$
declare
  c jsonb := coalesce(new.checklist, '{}'::jsonb);
begin
  if c ->> 'compatibilidade' = 'nao' then
    new.status := 'Inabilitada';
  elsif c ->> 'justificativa' = 'sim' and c ->> 'plano_trabalho' = 'sim'
    and c ->> 'compatibilidade' = 'sim' and c ->> 'doc_proponente' = 'sim' then
    new.status := 'Elegível';
  else
    new.status := 'Pendente';
  end if;
  return new;
end $$;
create trigger emendas_status before insert or update on emendas
  for each row execute function trg_emenda_status();

-- Módulo 3 — Demandas (Kanban)
create table demandas (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  solicitante text not null check (char_length(solicitante) between 2 and 200),
  contato text check (char_length(contato) <= 200),
  descricao text not null check (char_length(descricao) between 3 and 3000),
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  responsavel text check (char_length(responsavel) <= 200),
  prazo date,
  status text not null default 'a_fazer' check (status in ('a_fazer', 'em_andamento', 'concluido', 'arquivado')),
  dado_sensivel boolean not null default false,
  resposta text check (char_length(resposta) <= 5000),
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false
);

-- Módulo 4 — Projetos e planos de trabalho
create table projetos (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  titulo text not null check (char_length(titulo) between 3 and 300),
  problema text check (char_length(problema) <= 5000),
  justificativa text check (char_length(justificativa) <= 5000),
  objetivo_geral text check (char_length(objetivo_geral) <= 1000),
  objetivos_especificos jsonb not null default '[]'::jsonb check (jsonb_typeof(objetivos_especificos) = 'array'),
  metas jsonb not null default '[]'::jsonb check (jsonb_typeof(metas) = 'array'),
  cronograma jsonb not null default '[]'::jsonb check (jsonb_typeof(cronograma) = 'array'),
  status text not null default 'rascunho' check (status in ('rascunho', 'pronto', 'protocolado')),
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false
);

-- Módulos 5 e 6 — Pautas, roteiros e calendário editorial
create table pautas (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  tema text not null check (char_length(tema) between 3 and 300),
  mensagem_chave text not null check (char_length(mensagem_chave) between 3 and 500),
  dados_apoio text check (char_length(dados_apoio) <= 3000),
  publico text check (char_length(publico) <= 300),
  veiculo text not null default 'redes' check (veiculo in ('radio', 'tv', 'redes', 'imprensa', 'evento')),
  data_publicacao date,
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false
);

-- Módulo 7 — Captação de recursos
create table oportunidades (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  nome text not null check (char_length(nome) between 3 and 300),
  orgao_financiador text check (char_length(orgao_financiador) <= 200),
  valor numeric(14,2) check (valor >= 0),
  prazo_inscricao date,
  link text check (link is null or link ~ '^https?://'),
  requisitos jsonb not null default '[]'::jsonb check (jsonb_typeof(requisitos) = 'array'),
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false
);

-- Módulo 8 — Proposições e pedidos de informação
create table proposicoes (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  numero text not null check (char_length(numero) between 1 and 60),
  tipo text not null check (tipo in ('PL', 'PLC', 'PDL', 'PEC', 'Requerimento', 'Pedido de Informação', 'Indicação', 'Outro')),
  ementa text not null check (char_length(ementa) between 3 and 2000),
  data_apresentacao date not null default current_date,
  orgao_destino text check (char_length(orgao_destino) <= 200),
  prazo_dias integer check (prazo_dias between 0 and 3650),
  prazo_final date,
  status text not null default 'Apresentado'
    check (status in ('Apresentado', 'Em Análise', 'Em Pauta', 'Aprovado', 'Rejeitado', 'Respondido', 'Arquivado')),
  respondido_em date,
  criado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  arquivado boolean not null default false
);

create or replace function trg_proposicao_prazo() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.prazo_dias is not null then
    new.prazo_final := new.data_apresentacao + new.prazo_dias;
  else
    new.prazo_final := null;
  end if;
  if new.status = 'Respondido' and new.respondido_em is null then
    new.respondido_em := current_date;
  end if;
  return new;
end $$;
create trigger proposicoes_prazo before insert or update on proposicoes
  for each row execute function trg_proposicao_prazo();

-- ---------------------------------------------------------------------
-- 5. DOCUMENTOS (ofícios, checklists, planos) com código de verificação
-- ---------------------------------------------------------------------

create table documentos (
  id uuid primary key default gen_random_uuid(),
  gabinete_id uuid not null references gabinetes(id),
  tipo text not null check (tipo in ('oficio_resposta', 'oficio_cobranca', 'oficio', 'checklist_emenda',
                                     'plano_trabalho', 'roteiro_fala', 'relatorio_okr')),
  numero text not null,
  ano integer not null,
  seq integer not null,
  titulo text not null check (char_length(titulo) <= 300),
  conteudo text not null check (char_length(conteudo) <= 200000),
  conteudo_hash text not null,
  codigo text not null unique,
  origem_tabela text,
  origem_id uuid,
  emitido_por text not null,
  emitido_em timestamptz not null default now(),
  arquivo_hash text check (arquivo_hash is null or arquivo_hash ~ '^[0-9a-f]{64}$'),
  arquivo_nome text,
  arquivo_path text,
  arquivo_assinado boolean not null default false,
  arquivo_registrado_por text,
  arquivo_registrado_em timestamptz,
  cancelado boolean not null default false,
  cancelado_motivo text,
  unique (gabinete_id, tipo, ano, seq)
);
create index documentos_gab_idx on documentos (gabinete_id, emitido_em desc);

create table documento_sequencias (
  gabinete_id uuid not null references gabinetes(id),
  serie text not null,
  ano integer not null,
  ultimo integer not null default 0,
  primary key (gabinete_id, serie, ano)
);

-- Emite um documento: número sequencial por gabinete/série/ano + código de verificação.
-- Ofícios (resposta, cobrança e livre) compartilham a mesma numeração.
create or replace function emitir_documento(
  p_gabinete uuid, p_tipo text, p_titulo text, p_conteudo text,
  p_origem_tabela text default null, p_origem_id uuid default null
) returns documentos
language plpgsql security definer
set search_path = public
as $$
declare
  v_ano   integer := extract(year from (now() at time zone 'America/Porto_Velho'))::integer;
  v_serie text := case when p_tipo like 'oficio%' then 'oficio' else p_tipo end;
  v_seq   integer;
  v_sigla text;
  v_cod   text;
  v_doc   documentos;
begin
  if pode_escrever(p_gabinete) is not true then
    raise exception 'Sem permissão para emitir documentos neste gabinete.';
  end if;
  if p_conteudo is null or char_length(p_conteudo) < 10 then
    raise exception 'Documento sem conteúdo.';
  end if;

  insert into documento_sequencias (gabinete_id, serie, ano, ultimo)
  values (p_gabinete, v_serie, v_ano, 1)
  on conflict (gabinete_id, serie, ano) do update set ultimo = documento_sequencias.ultimo + 1
  returning ultimo into v_seq;

  select sigla into v_sigla from gabinetes where id = p_gabinete;
  v_cod := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_cod := substr(v_cod, 1, 5) || '-' || substr(v_cod, 6, 5) || '-' || substr(v_cod, 11, 5) || '-' || substr(v_cod, 16, 5);

  insert into documentos (gabinete_id, tipo, numero, ano, seq, titulo, conteudo, conteudo_hash, codigo,
                          origem_tabela, origem_id, emitido_por)
  values (p_gabinete, p_tipo, v_seq || '/' || v_ano || '/' || v_sigla, v_ano, v_seq,
          coalesce(nullif(trim(p_titulo), ''), 'Documento'), p_conteudo,
          encode(extensions.digest(p_conteudo, 'sha256'), 'hex'), v_cod,
          p_origem_tabela, p_origem_id, email_atual())
  returning * into v_doc;
  return v_doc;
end $$;

-- Registra o PDF final (assinado ou não). Um PDF assinado registrado não pode ser trocado.
create or replace function registrar_arquivo(
  p_doc uuid, p_hash text, p_nome text, p_path text, p_assinado boolean
) returns documentos
language plpgsql security definer
set search_path = public
as $$
declare
  v_doc documentos;
begin
  select * into v_doc from documentos where id = p_doc;
  if not found or pode_escrever(v_doc.gabinete_id) is not true then
    raise exception 'Documento não encontrado ou sem permissão.';
  end if;
  if v_doc.cancelado then
    raise exception 'Documento cancelado.';
  end if;
  if v_doc.arquivo_assinado then
    raise exception 'Este documento já tem um PDF assinado registrado e não pode ser substituído.';
  end if;
  if p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash inválido.';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> v_doc.gabinete_id::text then
    raise exception 'Caminho do arquivo inválido.';
  end if;
  update documentos set
    arquivo_hash = p_hash, arquivo_nome = left(p_nome, 200), arquivo_path = p_path,
    arquivo_assinado = coalesce(p_assinado, false),
    arquivo_registrado_por = email_atual(), arquivo_registrado_em = now()
  where id = p_doc
  returning * into v_doc;
  return v_doc;
end $$;

create or replace function cancelar_documento(p_doc uuid, p_motivo text) returns documentos
language plpgsql security definer
set search_path = public
as $$
declare
  v_doc documentos;
begin
  select * into v_doc from documentos where id = p_doc;
  if not found or eh_admin_gabinete(v_doc.gabinete_id) is not true then
    raise exception 'Apenas o administrador do gabinete pode cancelar documentos.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  update documentos set cancelado = true, cancelado_motivo = left(p_motivo, 500)
   where id = p_doc returning * into v_doc;
  return v_doc;
end $$;

-- Verificação PÚBLICA (qualquer pessoa, sem login). Não devolve conteúdo nem dados pessoais.
create or replace function verificar_documento(p_codigo text)
returns table (
  gabinete text, casa_legislativa text, tipo text, numero text, emitido_em timestamptz,
  arquivo_hash text, arquivo_assinado boolean, arquivo_registrado_em timestamptz,
  cancelado boolean
)
language sql stable security definer
set search_path = public
as $$
  select g.nome, g.casa_legislativa, d.tipo, d.numero, d.emitido_em,
         d.arquivo_hash, d.arquivo_assinado, d.arquivo_registrado_em, d.cancelado
    from documentos d join gabinetes g on g.id = d.gabinete_id
   where d.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Fa-f-]', '', 'g'))
   limit 1
$$;

create trigger documentos_auditoria after insert or update or delete on documentos
  for each row execute function trg_auditoria('gabinete_id');

-- ---------------------------------------------------------------------
-- 6. FUNÇÕES DE APOIO AO APLICATIVO
-- ---------------------------------------------------------------------

create or replace function meus_gabinetes()
returns table (id uuid, nome text, sigla text, parlamentar text, casa_legislativa text,
               cabecalho text[], brasao_url text, assinatura_nome text, assinatura_cargo text,
               plano text, situacao text, papel papel_membro)
language sql stable security definer
set search_path = public
as $$
  select g.id, g.nome, g.sigla, g.parlamentar, g.casa_legislativa, g.cabecalho, g.brasao_url,
         g.assinatura_nome, g.assinatura_cargo, g.plano, g.situacao, m.papel
    from membros m join gabinetes g on g.id = m.gabinete_id
   where m.email = email_atual() and m.ativo and g.situacao <> 'encerrado'
   order by g.nome
$$;

-- Plataforma: cria gabinete já com o primeiro administrador.
create or replace function criar_gabinete(
  p_nome text, p_sigla text, p_parlamentar text, p_casa text, p_email_admin text, p_plano text default 'demo'
) returns gabinetes
language plpgsql security definer
set search_path = public
as $$
declare
  v_gab gabinetes;
begin
  if eh_admin_plataforma() is not true then
    raise exception 'Apenas a administração da plataforma cria gabinetes.';
  end if;
  insert into gabinetes (nome, sigla, parlamentar, casa_legislativa, plano, cabecalho)
  values (p_nome, upper(p_sigla), p_parlamentar, p_casa, coalesce(p_plano, 'demo'),
          array_remove(array[upper(p_casa), 'Gabinete ' || coalesce(p_parlamentar, p_nome)], null))
  returning * into v_gab;
  insert into membros (gabinete_id, email, papel) values (v_gab.id, lower(trim(p_email_admin)), 'admin');
  return v_gab;
end $$;

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table gabinetes enable row level security;
alter table membros enable row level security;
alter table admins_plataforma enable row level security;
alter table auditoria enable row level security;
alter table documentos enable row level security;
alter table documento_sequencias enable row level security;

create policy gab_ler on gabinetes for select
  using (pode_ler(id) or eh_admin_plataforma());
create policy gab_alterar on gabinetes for update
  using (eh_admin_plataforma() or eh_admin_gabinete(id))
  with check (eh_admin_plataforma() or eh_admin_gabinete(id));

create policy mem_ler on membros for select
  using (pode_ler(gabinete_id) or eh_admin_plataforma());
create policy mem_inserir on membros for insert
  with check (eh_admin_plataforma() or eh_admin_gabinete(gabinete_id));
create policy mem_alterar on membros for update
  using (eh_admin_plataforma() or eh_admin_gabinete(gabinete_id))
  with check (eh_admin_plataforma() or eh_admin_gabinete(gabinete_id));

-- Trilha: só administradores e assessores leem; ninguém grava diretamente.
create policy aud_ler on auditoria for select
  using (papel_no_gabinete(gabinete_id) in ('admin', 'assessor'));

create policy doc_ler on documentos for select using (pode_ler(gabinete_id));

-- admins_plataforma e documento_sequencias: sem políticas = ninguém acessa pela API.

do $$
declare
  t text;
begin
  foreach t in array array['okr_objetivos', 'okr_krs', 'okr_lancamentos', 'emendas', 'demandas',
                           'projetos', 'pautas', 'oportunidades', 'proposicoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create index %I on %I (gabinete_id)', t || '_gab_idx', t);
    if t = 'demandas' then
      -- Demandas marcadas como sensíveis não aparecem para o perfil "leitura".
      execute format($p$create policy ler on %I for select using (
        pode_ler(gabinete_id) and (not dado_sensivel or papel_no_gabinete(gabinete_id) in ('admin','assessor')))$p$, t);
    else
      execute format('create policy ler on %I for select using (pode_ler(gabinete_id))', t);
    end if;
    execute format('create policy inserir on %I for insert with check (pode_escrever(gabinete_id))', t);
    if t <> 'okr_lancamentos' then
      execute format('create policy alterar on %I for update using (pode_escrever(gabinete_id)) with check (pode_escrever(gabinete_id))', t);
    end if;
    execute format('create trigger %I before insert or update on %I for each row execute function trg_carimbo()', t || '_carimbo', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function trg_auditoria(''gabinete_id'')', t || '_auditoria', t);
  end loop;
end $$;

create trigger okr_lancamentos_kr after insert on okr_lancamentos
  for each row execute function trg_lancamento_atualiza_kr();

-- ---------------------------------------------------------------------
-- 8. PERMISSÕES
-- Nenhum DELETE pela API (registros são arquivados). Visitantes (anon) só verificam documentos.
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke delete, truncate on all tables in schema public from authenticated;
revoke insert, update on auditoria, documentos, documento_sequencias, admins_plataforma from authenticated;
revoke update on okr_lancamentos from authenticated;
grant select, insert, update on gabinetes, membros, okr_objetivos, okr_krs, emendas, demandas,
  projetos, pautas, oportunidades, proposicoes to authenticated;
grant select, insert on okr_lancamentos to authenticated;
grant select on auditoria, documentos to authenticated;
revoke insert on gabinetes from authenticated; -- gabinetes só nascem por criar_gabinete()

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function verificar_documento(text) to anon;

-- ---------------------------------------------------------------------
-- 9. ARMAZENAMENTO DOS PDFs (bucket privado "documentos", pasta = id do gabinete)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "pdf_ler" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and pode_ler(uuid_ou_nulo((storage.foldername(name))[1])));
create policy "pdf_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and pode_escrever(uuid_ou_nulo((storage.foldername(name))[1])));
