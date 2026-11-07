"""Abre todas as telas em tamanho de celular (390x844, toque) e mede se algo vaza para os lados."""
import json, pathlib, sys
sys.argv = ['x']
import importlib.util
spec = importlib.util.spec_from_file_location('base', 'teste_telas.py')
src = open('teste_telas.py').read().split('with sync_playwright() as pw:')[0]   # só as funções auxiliares
base = {}; exec(src, base)
from playwright.sync_api import sync_playwright
OUT = pathlib.Path('capturas_celular'); OUT.mkdir(exist_ok=True)
paginas = ['index.html', 'demandas.html', 'okrs.html', 'emendas.html', 'projetos.html', 'comunicacao.html', 'captacao.html',
           'proposicoes.html', 'documentos.html', 'admin.html', 'plataforma.html', 'verificar.html']
with sync_playwright() as pw:
    nav = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--unsafely-treat-insecure-origin-as-secure=http://app.test'])
    ctx = nav.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='pt-BR')
    base['rotas'](ctx)
    ctx.add_init_script(f"localStorage.setItem('sb-teste-auth-token', {json.dumps(base['sessao']('jhennifernalin@gmail.com'))});")
    p = ctx.new_page(); p.set_default_timeout(12000)
    docs = []
    for pg in paginas + ['DOC']:
        url = pg
        if pg == 'DOC':
            p.goto('http://app.test/documentos.html'); p.wait_for_selector('tbody tr')
            url = p.locator('tbody tr a').first.get_attribute('href')
        p.goto('http://app.test/' + url); p.wait_for_timeout(2500)
        larg = p.evaluate("""() => { const d = document.documentElement; const largos = [...document.querySelectorAll('body *')]
          .filter(e => e.getBoundingClientRect().right > d.clientWidth + 2 && !e.closest('.kanban, .menu, .tabela-rolavel, table'))
          .slice(0, 4).map(e => e.tagName + '.' + e.className); return {sw: d.scrollWidth, cw: d.clientWidth, largos}; }""")
        print(f"{url[:40]:40} página {larg['sw']}px / tela {larg['cw']}px  {'VAZA' if larg['sw'] > larg['cw'] + 2 else 'ok'}  {larg['largos']}")
        p.screenshot(path=OUT / (pg.replace('.html', '') + '.png'), full_page=False)
    # formulário aberto
    p.goto('http://app.test/demandas.html'); p.wait_for_selector('.kanban'); p.click('text=+ Nova demanda'); p.wait_for_timeout(500)
    p.screenshot(path=OUT / 'form-demanda.png')
    nav.close()
