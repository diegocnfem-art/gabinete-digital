"""Teste de ponta a ponta das telas: navegador real + supabase-js real + PostgREST real sobre o banco de teste.
Auth e Storage do Supabase são simulados (login Google não roda fora da nuvem)."""
import json, time, pathlib, re, sys, mimetypes, urllib.request, base64, hmac, hashlib
from playwright.sync_api import sync_playwright

APP = pathlib.Path('/home/claude/gabinete-digital')
TOOLS = pathlib.Path('/home/claude/tools')
SHOTS = pathlib.Path('/home/claude/tests/capturas'); SHOTS.mkdir(exist_ok=True)
SEGREDO = b'segredo-de-teste-local-com-mais-de-32-caracteres'
PGRST = 'http://localhost:3555'
falhas, erros_console = [], []

def jwt(email):
    b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d, separators=(',', ':')).encode()).rstrip(b'=').decode()
    cab, corpo = b64({'alg': 'HS256', 'typ': 'JWT'}), b64({'sub': '00000000-0000-0000-0000-' + hashlib.md5(email.encode()).hexdigest()[:12],
        'email': email, 'role': 'authenticated', 'aud': 'authenticated', 'exp': int(time.time()) + 7200})
    sig = base64.urlsafe_b64encode(hmac.new(SEGREDO, f'{cab}.{corpo}'.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
    return f'{cab}.{corpo}.{sig}'

def sessao(email):
    tok = jwt(email)
    return json.dumps({'access_token': tok, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 7200,
        'expires_at': int(time.time()) + 7200, 'user': {'id': 'u', 'email': email, 'aud': 'authenticated', 'role': 'authenticated'}})

def rotas(ctx):
    def app(route):
        url = route.request.url.split('?')[0].replace('http://app.test/', '') or 'index.html'
        if url == 'config.js':
            corpo = (APP / 'config.js').read_text().replace('https://SEU-PROJETO.supabase.co', 'https://teste.supabase.co')
            return route.fulfill(body=corpo, content_type='application/javascript')
        f = APP / url
        if not f.exists(): return route.fulfill(status=404, body='404')
        return route.fulfill(body=f.read_bytes(), content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
    ctx.route('http://app.test/**', app)
    ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**', lambda r: r.fulfill(body=(TOOLS / 'supabase.bundle.mjs').read_bytes(), content_type='application/javascript'))
    ctx.route('https://cdn.jsdelivr.net/npm/qrcode-generator**', lambda r: r.fulfill(body=(TOOLS / 'node_modules/qrcode-generator/qrcode.js').read_bytes(), content_type='application/javascript'))

    def rest(route):
        req = route.request
        alvo = PGRST + req.url.split('/rest/v1', 1)[1]
        hdrs = {k: v for k, v in req.headers.items() if k.lower() in ('authorization', 'content-type', 'prefer', 'accept', 'range', 'range-unit', 'content-profile', 'accept-profile')}
        if hdrs.get('authorization', '').endswith('COLE-AQUI-A-ANON-KEY') or 'Bearer COLE' in hdrs.get('authorization', ''):
            hdrs.pop('authorization')  # chave anon fictícia → requisição anônima
        r = urllib.request.Request(alvo, data=req.post_data_buffer, method=req.method, headers=hdrs)
        try:
            with urllib.request.urlopen(r) as resp:
                return route.fulfill(status=resp.status, body=resp.read(), headers={'content-type': resp.headers.get('content-type', 'application/json'),
                    'content-range': resp.headers.get('content-range', ''), 'access-control-allow-origin': '*'})
        except urllib.error.HTTPError as e:
            return route.fulfill(status=e.code, body=e.read(), headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
    ctx.route('https://teste.supabase.co/rest/v1/**', rest)

    def storage(route):
        u = route.request.url
        if '/object/sign/' in u: return route.fulfill(body=json.dumps({'signedURL': '/object/sign/documentos/x.pdf?token=t'}), content_type='application/json')
        return route.fulfill(body=json.dumps({'Key': 'documentos/x', 'Id': 'x'}), content_type='application/json')
    ctx.route('https://teste.supabase.co/storage/v1/**', storage)
    ctx.route('https://teste.supabase.co/auth/v1/**', lambda r: r.fulfill(body='{}', content_type='application/json'))

def ok(cond, msg):
    print(('ok - ' if cond else 'FALHOU - ') + msg)
    if not cond: falhas.append(msg)

def nova_pagina(navegador, email=None):
    ctx = navegador.new_context(viewport={'width': 1360, 'height': 900}, accept_downloads=True, locale='pt-BR', timezone_id='America/Porto_Velho')
    rotas(ctx)
    if email: ctx.add_init_script(f"localStorage.setItem('sb-teste-auth-token', {json.dumps(sessao(email))});")
    p = ctx.new_page(); p.set_default_timeout(12000)
    p.on('console', lambda m: erros_console.append(f'[{p.url}] {m.text}') if m.type == 'error' else None)
    p.on('pageerror', lambda e: erros_console.append(f'[{p.url}] PAGEERROR {e}'))
    p.on('dialog', lambda d: (falhas.append(f'diálogo nativo inesperado: {d.message}'), d.dismiss()))
    return p

def form(p, valores):
    dlg = p.locator('dialog[open]')
    for nome, v in valores.items():
        el = dlg.locator(f'[name="{nome}"]')
        tag = el.evaluate('e => e.tagName + ":" + (e.type||"")')
        if tag.startswith('SELECT'): el.select_option(v)
        elif tag == 'INPUT:checkbox': el.set_checked(v)
        else: el.fill(v)
    return dlg

def salvar(p, rotulo='Salvar'):
    p.locator('dialog[open] .modal-rodape button.primario').click()
    p.wait_for_timeout(700)

with sync_playwright() as pw:
    nav = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--unsafely-treat-insecure-origin-as-secure=http://app.test'])

    # ---------- Login ----------
    p = nova_pagina(nav)
    p.goto('http://app.test/index.html'); p.wait_for_selector('.btn-google')
    ok(p.locator('text=Entrar com Google').count() == 1, 'Tela de login sem sessão')
    p.screenshot(path=SHOTS / '00-login.png')

    p = nova_pagina(nav, 'jhennifernalin@gmail.com')
    p.goto('http://app.test/index.html'); p.wait_for_selector('.indicador .valor', timeout=15000)
    ok(p.locator('h1', has_text='Gabinete Demonstração').count() == 1, 'Painel do gabinete carrega para o admin')
    ok(p.locator('.selo-demo').count() == 1, 'Selo DEMONSTRAÇÃO aparece no plano demo')

    # ---------- Demandas ----------
    p.goto('http://app.test/demandas.html'); p.wait_for_selector('.kanban')
    p.click('text=+ Nova demanda')
    form(p, {'solicitante': 'Maria <img src=x onerror=alert(1)>', 'descricao': 'Iluminação pública apagada na Rua 7 há 15 dias.',
             'prioridade': 'alta', 'prazo': '2026-11-01', 'resposta': 'Encaminhamos à concessionária, que fez o reparo em 03/11.'})
    salvar(p)
    card = p.locator('.card', has_text='Maria')
    ok(card.count() == 1, 'Demanda criada aparece no Kanban')
    ok('<img' in card.locator('h4').inner_text(), 'Texto com HTML é exibido como texto (sem XSS)')
    ok('atrasado' in card.get_attribute('class'), 'Cartão com prazo vencido fica destacado')
    p.click('.card >> text=→ Em Andamento'); p.wait_for_timeout(600)
    ok(p.locator('section[data-status=em_andamento] .card').count() == 1, 'Botão move cartão para Em Andamento')
    # arrastar e soltar
    p.drag_and_drop('section[data-status=em_andamento] .card', 'section[data-status=concluido]'); p.wait_for_timeout(800)
    ok(p.locator('section[data-status=concluido] .card').count() == 1, 'Arrastar e soltar move para Concluído')
    p.locator('section[data-status=concluido] .card >> text=Abrir').click(); p.wait_for_selector('.historico')
    ok(p.locator('.historico li').count() >= 3 and 'Em Andamento → Concluído' in p.locator('.historico').inner_text(), 'Histórico mostra as mudanças de status com autor')
    p.screenshot(path=SHOTS / '02-demanda-historico.png')
    p.locator('dialog[open] .fechar').click()
    p.screenshot(path=SHOTS / '01-kanban.png')

    # ---------- Ofício a partir da demanda ----------
    p.click('text=Gerar ofício'); p.wait_for_selector('.folha .corpo')
    ok('Encaminhamos à concessionária' in p.locator('.folha').inner_text(), 'Ofício de resposta traz o encaminhamento da demanda')
    p.screenshot(path=SHOTS / '03-oficio-rascunho.png')
    p.click('text=Emitir documento'); p.locator('dialog[open] >> text=Confirmar').click()
    p.wait_for_selector('.rodape-verif', timeout=15000)
    texto = p.locator('.folha').inner_text()
    ok('OFÍCIO Nº 1/2026/GAB-DEMO' in texto, 'Número oficial gerado pelo servidor (1/2026/GAB-DEMO)')
    m = re.search(r'([0-9A-F]{5}(?:-[0-9A-F]{5}){3})', texto); codigo = m.group(1) if m else None
    ok(codigo is not None, 'Código de verificação no rodapé')
    ok(p.locator('.rodape-verif svg').count() == 1, 'QR Code gerado no rodapé')
    p.screenshot(path=SHOTS / '04-oficio-emitido.png', full_page=True)
    # registrar PDF assinado
    pdf = SHOTS / 'oficio-assinado.pdf'; pdf.write_bytes(b'%PDF-1.4\n% teste de documento assinado\n%%EOF\n')
    p.set_input_files('input[type=file]', str(pdf))
    p.click('text=Registrar PDF'); p.wait_for_timeout(2500)
    ok('PDF ASSINADO registrado' in p.locator('.painel-doc').inner_text(), 'PDF assinado registrado com hash')
    if falhas: print('DEBUG painel:', p.locator('.painel-doc').inner_text()[:600]); print('DEBUG console:', erros_console[-5:])
    ok(p.locator('text=Registrar PDF').count() == 0, 'Após PDF assinado, não há opção de substituir')

    # ---------- Verificação pública (sem login) ----------
    v = nova_pagina(nav)
    v.goto(f'http://app.test/verificar.html?c={codigo}'); v.wait_for_selector('.aviso', timeout=10000)
    ok('Documento autêntico' in v.inner_text('main'), 'Verificação pública confirma documento autêntico')
    ok('Maria' not in v.inner_text('main'), 'Verificação pública não expõe dados pessoais')
    v.set_input_files('input[type=file]', str(pdf)); v.wait_for_timeout(800)
    ok('Arquivo idêntico' in v.inner_text('main'), 'Arquivo original confere com o hash registrado')
    outro = SHOTS / 'adulterado.pdf'; outro.write_bytes(b'%PDF-1.4\n% adulterado\n%%EOF\n')
    v.set_input_files('input[type=file]', str(outro)); v.wait_for_timeout(800)
    ok('DIFERENTE' in v.inner_text('main'), 'Arquivo alterado é detectado')
    v.screenshot(path=SHOTS / '05-verificacao.png', full_page=True)
    v.fill('input[type=text]', '00000-00000-00000-00000'); v.click('button:has-text("Verificar")'); v.wait_for_timeout(800)
    ok('não encontrado' in v.inner_text('main'), 'Código falso é recusado')

    # ---------- OKRs ----------
    p.goto('http://app.test/okrs.html'); p.wait_for_selector('main h1')
    p.click('text=+ Novo objetivo'); form(p, {'titulo': 'Aproximar o mandato da comunidade', 'ciclo': '2027-T1'}); salvar(p)
    p.click('text=+ KR'); form(p, {'descricao': 'Realizar 12 visitas aos bairros', 'meta': '12', 'unidade': 'visitas', 'prazo': '2026-11-10'}); salvar(p)
    p.click('text=Lançar'); form(p, {'valor': '3', 'observacao': 'Relatórios de visita'}); salvar(p)
    ok('25%' in p.inner_text('main'), 'Progresso calculado (3 de 12 = 25%)')
    ok(p.locator('text=em risco').count() >= 1, 'KR com prazo curto e progresso < 50% sinalizado em risco')
    p.screenshot(path=SHOTS / '06-okrs.png', full_page=True)

    # ---------- Emendas ----------
    p.goto('http://app.test/emendas.html'); p.wait_for_selector('main h1')
    p.click('text=+ Nova emenda')
    form(p, {'numero': '015/2027', 'valor': '150.000,00', 'objeto': 'Reforma da Escola Estadual X', 'orgao_destino': 'SEDUC'})
    for k in ['justificativa', 'plano_trabalho', 'compatibilidade', 'doc_proponente']:
        p.locator(f'dialog[open] label.campo:has-text("{ {"justificativa":"Justificativa","plano_trabalho":"Plano de Trabalho","compatibilidade":"Compatível","doc_proponente":"proponente"}[k] }") input[value=sim]').check()
    salvar(p)
    ok(p.locator('td .etiqueta', has_text='Elegível').count() == 1, 'Emenda com checklist completo = Elegível (calculado no servidor)')
    ok('150.000,00' in p.inner_text('main'), 'Valor em moeda interpretado corretamente')
    p.screenshot(path=SHOTS / '07-emendas.png', full_page=True)
    p.click('text=Checklist PDF'); p.wait_for_selector('.folha')
    ok('Elegível' in p.inner_text('.folha'), 'Checklist em documento traz a situação')

    # ---------- Projetos ----------
    p.goto('http://app.test/projetos.html'); p.wait_for_selector('main h1')
    p.click('text=+ Novo projeto')
    p.click('text=Próxima →'); ok('Para avançar' in p.inner_text('main'), 'Assistente bloqueia avanço com campos vazios')
    ins = p.locator('.cartao input, .cartao textarea')
    ins.nth(0).fill('Bairro Iluminado'); ins.nth(1).fill('Ruas sem iluminação aumentam a insegurança.'); ins.nth(2).fill('Demandas recorrentes no gabinete.')
    p.click('text=Próxima →')
    p.locator('.cartao input').first.fill('Ampliar a iluminação pública no bairro')
    p.locator('.cartao textarea').fill('Mapear pontos escuros\nArticular com a concessionária\nAcompanhar a execução')
    p.click('text=Próxima →')
    linhas = p.locator('.cartao tbody tr')
    linhas.nth(0).locator('input').nth(0).fill('Pontos instalados'); linhas.nth(0).locator('input').nth(1).fill('40'); linhas.nth(0).locator('input').nth(2).fill('Pontos ativos')
    p.click('text=Próxima →')
    l0 = p.locator('.cartao tbody tr').nth(0).locator('input')
    l0.nth(0).fill('Mapeamento'); l0.nth(1).fill('Assessoria'); l0.nth(2).fill('2027-01-10'); l0.nth(3).fill('2027-02-10')
    p.click('text=Próxima →')
    p.click('text=Salvar projeto'); p.wait_for_timeout(900)
    ok(p.locator('text=Gerar plano de trabalho').count() == 1, 'Projeto salvo após as 5 etapas')
    p.click('text=Gerar plano de trabalho'); p.wait_for_selector('.folha')
    ok('Metas e indicadores' in p.inner_text('.folha') and 'Pontos instalados' in p.inner_text('.folha'), 'Plano de trabalho com seções e metas')
    p.screenshot(path=SHOTS / '08-plano-trabalho.png', full_page=True)

    # ---------- Comunicação ----------
    p.goto('http://app.test/comunicacao.html'); p.wait_for_selector('main h1')
    p.click('text=+ Nova pauta')
    form(p, {'tema': 'Iluminação no bairro', 'mensagem_chave': 'Rua iluminada é rua mais segura.', 'dados_apoio': '40 pontos instalados.', 'veiculo': 'radio'}); salvar(p)
    ok(p.locator('td', has_text='Iluminação no bairro').count() == 1, 'Pauta criada')
    p.screenshot(path=SHOTS / 'debug-pauta.png')
    p.click('.abas >> text=Calendário editorial'); p.wait_for_selector('.calendario')
    p.drag_and_drop('.chip-pauta', '.calendario .dia:not(.fora) >> nth=10'); p.wait_for_timeout(900)
    ok(p.locator('.calendario .chip-pauta').count() == 1, 'Pauta arrastada para um dia do calendário')
    p.screenshot(path=SHOTS / '09-calendario.png', full_page=True)
    p.click('.abas >> text=Card para redes'); p.wait_for_selector('canvas')
    p.screenshot(path=SHOTS / '10-card.png')
    p.click('.abas >> text=Pautas'); p.click('a:has-text("Roteiro de fala")'); p.wait_for_selector('.folha')
    ok('Rua iluminada é rua mais segura' in p.inner_text('.folha'), 'Roteiro de fala com a mensagem-chave')

    # ---------- Captação ----------
    p.goto('http://app.test/captacao.html'); p.wait_for_selector('main h1')
    p.click('text=+ Nova oportunidade')
    form(p, {'nome': 'Edital Cidades Seguras', 'orgao_financiador': 'Ministério X', 'valor': '500000', 'prazo_inscricao': '2026-11-08'})
    p.locator('dialog[open] .lista-editavel input[type=text]').first.fill('CNPJ ativo')
    p.locator('dialog[open] .lista-editavel input[type=checkbox]').first.check()
    salvar(p)
    ok('fecham em menos de 7 dias' in p.inner_text('main'), 'Alerta de edital com prazo < 7 dias')
    p.screenshot(path=SHOTS / '11-captacao.png', full_page=True)

    # ---------- Proposições ----------
    p.goto('http://app.test/proposicoes.html'); p.wait_for_selector('main h1')
    p.click('button:has-text("+ Nova proposição")')
    form(p, {'numero': '45/2026', 'ementa': 'Solicita informações sobre a manutenção da iluminação pública.', 'orgao_destino': 'SEOSP',
             'data_apresentacao': '2026-09-01', 'prazo_dias': '30'}); salvar(p)
    ok(p.locator('td .etiqueta', has_text='Cobrar resposta').count() == 1, 'Pedido vencido vira "Cobrar resposta"')
    p.screenshot(path=SHOTS / '12-proposicoes.png', full_page=True)
    p.click('a:has-text("Ofício de cobrança")'); p.wait_for_selector('.folha')
    ok('encerrou-se em 01/10/2026' in p.inner_text('.folha'), 'Ofício de cobrança com prazo calculado')
    p.click('text=Emitir documento'); p.locator('dialog[open] >> text=Confirmar').click(); p.wait_for_selector('.rodape-verif', timeout=15000)
    ok('2/2026/GAB-DEMO' in p.inner_text('.folha'), 'Ofícios compartilham numeração (2º ofício = 2/2026)')

    # ---------- Documentos ----------
    p.goto('http://app.test/documentos.html'); p.wait_for_selector('table')
    ok(p.locator('tbody tr').count() == 2 and p.locator('.etiqueta', has_text='assinado').count() == 1, 'Lista de documentos com situação do PDF')

    # ---------- Administração ----------
    p.goto('http://app.test/admin.html'); p.wait_for_selector('table')
    p.click('text=+ Liberar acesso'); form(p, {'email': 'Leitor@Exemplo.com', 'nome': 'Leitor Teste', 'papel': 'leitura'}); salvar(p)
    ok(p.locator('td', has_text='leitor@exemplo.com').count() == 1, 'Membro incluído (e-mail em minúsculas)')
    p.click('.abas >> text=Trilha de auditoria'); p.wait_for_selector('table')
    p.click('text=Conferir integridade'); p.wait_for_selector('text=Trilha íntegra', timeout=8000)
    ok('Trilha íntegra' in p.inner_text('main'), 'Integridade da trilha conferida pela tela')
    p.screenshot(path=SHOTS / '13-trilha.png', full_page=True)
    p.click('.abas >> text=Exportar dados')
    with p.expect_download() as d: p.click('text=Exportar tudo (JSON)')
    dados = json.loads(pathlib.Path(d.value.path()).read_text())
    ok(len(dados['tabelas']['demandas']) == 1 and len(dados['tabelas']['documentos']) == 2, 'Exportação completa em JSON')

    # ---------- Perfil leitura ----------
    l = nova_pagina(nav, 'leitor@exemplo.com')
    l.goto('http://app.test/demandas.html'); l.wait_for_selector('.kanban')
    ok(l.locator('text=+ Nova demanda').count() == 0 and l.locator('text=somente leitura').count() == 1, 'Perfil leitura não vê botões de gravação')
    ok(l.locator('.menu >> text=Administração').count() == 0, 'Perfil leitura não vê Administração')

    # ---------- Usuário sem cadastro ----------
    s = nova_pagina(nav, 'estranho@exemplo.com')
    s.goto('http://app.test/index.html'); s.wait_for_selector('text=Acesso não liberado')
    ok(True, 'E-mail sem cadastro recebe "Acesso não liberado"')
    s.goto('http://app.test/demandas.html'); s.wait_for_timeout(1500)
    ok(s.url.endswith('index.html'), 'Sem gabinete, telas internas voltam ao início')

    # ---------- Plataforma ----------
    p.goto('http://app.test/plataforma.html'); p.wait_for_selector('table')
    p.click('text=+ Novo gabinete')
    form(p, {'nome': 'Gabinete Dep. Fulano', 'sigla': 'gab-fulano', 'plano': 'pro', 'parlamentar': 'Dep. Fulano', 'casa': 'ALE-RO', 'email_admin': 'fulano@exemplo.com'})
    salvar(p)
    ok(p.locator('td', has_text='GAB-FULANO').count() == 1, 'Plataforma cria gabinete com primeiro admin')
    p.screenshot(path=SHOTS / '14-plataforma.png', full_page=True)
    f = nova_pagina(nav, 'fulano@exemplo.com')
    f.goto('http://app.test/demandas.html'); f.wait_for_selector('.kanban')
    ok(f.locator('.card').count() == 0, 'Novo gabinete NÃO vê as demandas do gabinete Demonstração')

    p.goto('http://app.test/index.html'); p.wait_for_selector('.indicador .valor', timeout=15000)
    p.screenshot(path=SHOTS / '15-painel.png', full_page=True)
    nav.close()

ruido = [e for e in erros_console if 'favicon' not in e]
print('\nErros de console:', len(ruido)); [print('  ', e) for e in ruido[:30]]
print('\nFALHAS:', len(falhas)); [print('  -', x) for x in falhas]
sys.exit(1 if falhas else 0)
