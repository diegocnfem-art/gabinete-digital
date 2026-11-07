-- =====================================================================
-- PRIMEIRO ACESSO — rode depois do 01_esquema.sql.
-- Troque os e-mails abaixo pelos e-mails Google reais dos sócios.
-- =====================================================================

-- 1. Administradores da plataforma (podem criar e suspender gabinetes).
insert into admins_plataforma (email) values
  ('jhennifernalin@gmail.com')
  -- , ('email.do.natan@gmail.com')
  -- , ('email.do.daniel@gmail.com')
on conflict do nothing;

-- 2. (Opcional) Um gabinete de demonstração para as aulas.
--    O primeiro administrador do gabinete é o e-mail informado no final.
insert into gabinetes (nome, sigla, parlamentar, casa_legislativa, plano, cabecalho,
                       assinatura_nome, assinatura_cargo)
values ('Gabinete Demonstração', 'GAB-DEMO', 'Deputada Exemplo', 'Assembleia Legislativa (Demonstração)', 'demo',
        array['ASSEMBLEIA LEGISLATIVA (DEMONSTRAÇÃO)', 'Gabinete da Deputada Exemplo'],
        'Deputada Exemplo', 'Deputada Estadual');

insert into membros (gabinete_id, email, papel)
select id, 'jhennifernalin@gmail.com', 'admin' from gabinetes where sigla = 'GAB-DEMO'
on conflict do nothing;
