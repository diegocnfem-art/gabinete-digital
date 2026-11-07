# Gabinete Digital — sistema dos 7 módulos do Curso de Assessoria Parlamentar 2027

Sistema web para gabinetes parlamentares, com os sete módulos do curso sobre uma mesma base segura:

| Tela | Módulo do curso | O que faz |
| --- | --- | --- |
| `demandas.html` | 3 — Gestão de Gabinete | Kanban (A Fazer → Em Andamento → Concluído → Arquivado), arrastar e soltar, alerta de atraso, histórico com autor, ofício de resposta |
| `okrs.html` | 1 — Planejamento com OKR | Objetivos e até 5 KRs, lançamentos de progresso, % automático, alerta de risco, relatório |
| `emendas.html` | 2 — Orçamento e Emendas | Cadastro, checklist documental, situação calculada pelo servidor (Elegível/Pendente/Inabilitada), checklist em PDF |
| `projetos.html` | 4 — Projetos Públicos | Assistente em 5 etapas com validação, plano de trabalho com capa, sumário e seções |
| `comunicacao.html` | 5 e 6 — Comunicação e Redes | Pautas, roteiro de fala, calendário editorial (arrastar para o dia), card PNG para redes |
| `captacao.html` | 7 — Captação de Recursos | Oportunidades, requisitos, score de prontidão, alerta de prazo < 7 dias |
| `proposicoes.html` | 8 — Processo Legislativo | Trâmite, prazo final calculado, "Cobrar resposta" automático, ofício de cobrança, painel de fiscalização |
| `documentos.html` / `documento.html` | Todos | Emissão com número sequencial e código de verificação + QR Code, cópia para SEI, registro do PDF assinado |
| `verificar.html` | Público | Qualquer pessoa confere se um documento é autêntico e se o arquivo é idêntico ao registrado |
| `admin.html` | Núcleo | Membros e perfis, identidade visual, trilha de auditoria, exportação completa dos dados |
| `plataforma.html` | Núcleo | Sócios criam, suspendem e encerram gabinetes clientes |

**Tecnologia:** HTML + JavaScript puro (sem instalação), Supabase (banco PostgreSQL + login Google + armazenamento de PDFs), publicação no GitHub Pages.

---

## Instalação (cerca de 1 hora, uma única vez)

### 1. Criar o projeto no Supabase
1. Crie uma conta em <https://supabase.com> e um **novo projeto**. Em *Region*, escolha **South America (São Paulo)** — os dados ficam no Brasil.
2. Guarde a senha do banco num gerenciador de senhas.

### 2. Criar o banco
1. No Supabase, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase/01_esquema.sql` e clique em **Run**. Deve terminar sem erro.
3. Abra `supabase/02_primeiro_acesso.sql`, **troque os e-mails** pelos e-mails Google dos sócios e rode também.

### 3. Ligar o login com Google
1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto → **Google Auth Platform** → configure a tela de consentimento (nome "Gabinete Digital", e-mail de suporte).
2. Em **Clients → Create client → Web application**:
   - *Authorized JavaScript origins*: o endereço do site (ex.: `https://sua-org.github.io`).
   - *Authorized redirect URIs*: o endereço de callback que o Supabase mostra em **Authentication → Providers → Google** (formato `https://SEU-PROJETO.supabase.co/auth/v1/callback`).
3. Copie o *Client ID* e o *Client secret* para **Supabase → Authentication → Providers → Google** e ative.
4. Em **Authentication → URL Configuration**: *Site URL* = endereço do site; em *Redirect URLs* adicione `https://sua-org.github.io/gabinete-digital/**`.

### 4. ⚠️ Desligar o login por e-mail e senha
Em **Authentication → Providers → Email**, **desative** o provedor. O acesso ao gabinete é liberado pelo e-mail; com cadastro por e-mail aberto, alguém poderia criar conta com o e-mail de outra pessoa. Com só o Google ativo, o e-mail é sempre verificado pelo Google.

### 5. Configurar o site
Edite `config.js` e preencha:
- `SUPABASE_URL` — em **Project Settings → API** (ex.: `https://abcd1234.supabase.co`).
- `SUPABASE_ANON_KEY` — a chave **anon** ou **publishable** da mesma tela.

Essa chave é pública por natureza (fica no navegador de qualquer jeito). Quem protege os dados são as regras do banco. **Nunca** coloque no site a chave `service_role` / `secret`.

### 6. Publicar
1. Crie um repositório no GitHub (pode ser privado no plano Team) e envie todos os arquivos desta pasta.
2. **Settings → Pages → Deploy from a branch → main / (root)**.
3. O site fica em `https://sua-org.github.io/nome-do-repositorio/`. Depois, se quiserem, liguem o domínio `.com.br` em *Pages → Custom domain*.

### 7. Primeiro acesso
1. Entre com a conta Google cadastrada no passo 2.
2. Você verá o **Gabinete Demonstração** (para as aulas) e o menu **Plataforma**.
3. Em **Plataforma → + Novo gabinete**, cadastre cada cliente com o e-mail do primeiro administrador. Ele mesmo libera os assessores em **Administração → Membros**.

---

## Perfis de acesso

| Perfil | Pode |
| --- | --- |
| Administração da plataforma (sócios) | Criar, suspender e encerrar gabinetes; incluir administradores. **Não vê** os dados internos dos gabinetes. |
| Administrador do gabinete | Tudo no gabinete + membros, identidade visual, trilha, exportação, cancelar documentos |
| Assessor | Ler e gravar em todos os módulos, emitir documentos, ver demandas sensíveis |
| Somente leitura | Ler (não vê demandas marcadas como sensíveis nem a trilha) |

Gabinete **suspenso**: os membros consultam e exportam, mas não alteram. **Encerrado**: sem acesso.

---

## Como funciona a segurança

- **Login individual com Google.** Não há token fixo nem `?admin=1`. Cada ação fica registrada com o e-mail de quem fez.
- **As regras moram no banco (Row Level Security).** Mesmo que alguém abra o F12 e chame a API diretamente, o banco só devolve e só aceita dados do gabinete do qual a pessoa é membro ativo, conforme o perfil.
- **Nada é apagado.** Não existe DELETE pela API: registros são arquivados.
- **Trilha de auditoria com hash encadeado.** Toda criação e alteração gera um registro com o hash do anterior. Em *Administração → Trilha → Conferir integridade*, qualquer alteração feita direto no banco é detectada.
- **Autoria e datas são do servidor.** O navegador não consegue falsificar "quem criou" nem mudar o gabinete de um registro.
- **Sem HTML injetado.** Todo texto digitado é exibido como texto; o editor de documentos passa por um filtro de etiquetas permitidas. As páginas têm *Content-Security-Policy*.
- **Documentos com número e código.** A numeração é feita no banco (sem duplicidade). O código de verificação tem 80 bits aleatórios. A página pública mostra só gabinete, tipo, número e data — nunca o conteúdo ou dados pessoais.
- **PDFs num cofre privado** (bucket `documentos`), separados por pasta de gabinete.
- **Exportação completa** a qualquer momento, inclusive com o gabinete suspenso — o gabinete é o dono dos dados.

## Assinatura com gov.br

A API de assinatura gov.br só pode ser integrada por órgãos públicos, em domínio oficial. Por isso o sistema usa o caminho possível hoje:

1. Emita o documento e clique em **Imprimir / Salvar PDF**.
2. Assine o PDF no **Assinador gov.br** (<https://assinador.iti.br>, conta prata ou ouro) — ou no SEI da Casa.
3. Volte ao documento e **registre o PDF assinado**. O sistema guarda o arquivo e o hash SHA-256. Depois de registrado como assinado, ele não pode ser trocado.
4. Quem receber o documento confere em `verificar.html` (código ou QR Code) se o arquivo é idêntico. A validade jurídica da assinatura é conferida no Validar do ITI (<https://validar.iti.gov.br>).

Se uma Casa Legislativa adotar o sistema no domínio dela, a integração direta com a API gov.br passa a ser possível (rota B do documento de arquitetura).

## Antes de usar com dados reais (plano Pro)

- [ ] Contrato com cada gabinete definindo **gabinete = controlador** e **sociedade = operadora** (LGPD), suboperadores (Supabase, Google, GitHub) e devolução dos dados no encerramento.
- [ ] Política de privacidade e termo de uso, com a regra de que o cadastro de cidadãos **não pode ser usado para fins eleitorais**.
- [ ] Plano de incidente: quem avisa o gabinete e em quanto tempo.
- [ ] Ativar 2FA nas contas Google dos administradores e nas contas Supabase/GitHub dos sócios.
- [ ] No Supabase, plano pago para ter backups diários automáticos (no gratuito, façam exportações periódicas).
- [ ] Gabinetes de demonstração do curso só com dados fictícios.

## Uso no celular

Todas as telas funcionam no navegador do celular (não precisa instalar aplicativo). No celular:
- o topo fica compacto e o menu desliza para o lado;
- as tabelas viram cartões com "rótulo: valor";
- os formulários abrem em tela cheia, com campos grandes (sem o zoom automático do iPhone);
- no Kanban, deslize entre as colunas e use o botão "→" para mover a demanda (arrastar e soltar só funciona com mouse);
- no calendário editorial, toque na pauta e escolha a data.

Gerar e imprimir o PDF oficial e assinar no gov.br é mais confortável no computador.

## Ajustes simples

- **Nome do sistema e limite do Kanban:** `config.js`.
- **Cores:** início de `css/app.css`.
- **Textos dos ofícios:** objeto `MODELOS` em `js/documento.js` (cada modelo é um texto com campos do registro).

## Estrutura dos arquivos

```
config.js                 ← preencher (URL e chave pública do Supabase)
*.html                    ← uma página por tela
css/app.css               ← visual
js/lib.js                 ← núcleo: sessão, layout, formulários, segurança de HTML
js/<tela>.js              ← lógica de cada tela
js/constantes.js          ← listas compartilhadas
supabase/01_esquema.sql   ← banco completo (tabelas, regras, auditoria, documentos)
supabase/02_primeiro_acesso.sql ← administradores e gabinete de demonstração
testes/                   ← testes automáticos usados no desenvolvimento
```

## Testes realizados

- `testes/testes_rls.sql` — 52 verificações no banco (PostgreSQL 16): isolamento entre gabinetes, perfis, suspensão, bloqueio de DELETE, trilha e detecção de adulteração, numeração, verificação pública, armazenamento.
- `testes/teste_celular.py` — abre todas as telas em tamanho de celular (390 px, toque) e confere que nada vaza para os lados.
- `testes/teste_telas.py` — 45 verificações de ponta a ponta em navegador real (Chrome) com a biblioteca oficial do Supabase e a API PostgREST: todos os módulos, emissão e verificação de documento, XSS, perfis e exportação. O login Google e o armazenamento de arquivos foram simulados (só funcionam na nuvem).
