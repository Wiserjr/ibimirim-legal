"""Build the GitHub Pages site: one folder per municipality plus a cover.

    python tools/build_pages.py

Pages serves docs/ over HTTPS, which is what an iPhone needs before Safari
offers "Adicionar à Tela de Início". The cover only points to the builds; each
municipality's folder is the same self-contained app that opens by double
click, so nothing here is a second implementation.
"""
from __future__ import annotations

import json
from pathlib import Path

from build import MUNICIPIOS, ROOT, build

DOCS = ROOT / "docs"

CAPA = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#153f38">
<meta name="description" content="Consulta offline à legislação tributária e urbana municipal.">
<title>Consulta à legislação municipal</title>
<style>
:root{{--ink:#17332e;--muted:#62736f;--paper:#f7f4ec;--green:#153f38;--green2:#276c5e;--line:#dce4df;
font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}}
*{{box-sizing:border-box}}
body{{margin:0;padding:0 24px 64px;background:radial-gradient(circle at 90% 8%,#e2eee6 0,transparent 27%),var(--paper)}}
main{{max-width:900px;margin:auto}}
header{{padding:72px 0 8px}}
.eyebrow{{text-transform:uppercase;letter-spacing:.15em;font-weight:800;color:var(--green2);font-size:12px;margin:0 0 12px}}
h1{{font-family:Georgia,serif;font-size:clamp(38px,6vw,64px);line-height:1.03;letter-spacing:-.03em;margin:0 0 18px;color:var(--green)}}
header p{{font-size:18px;line-height:1.65;color:var(--muted);max-width:640px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:38px}}
a.card{{display:block;padding:26px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.8);
text-decoration:none;color:var(--ink);transition:.2s}}
a.card:hover{{transform:translateY(-4px);box-shadow:0 16px 45px rgba(21,63,56,.11);border-color:#a8c3b9}}
.seal{{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:var(--green);
color:#fff;font-weight:800;letter-spacing:-1px;margin-bottom:18px}}
a.card h2{{font:700 25px/1.2 Georgia,serif;margin:0 0 6px;color:var(--green)}}
a.card p{{margin:0;color:var(--muted);line-height:1.5;font-size:14px}}
a.card small{{display:block;margin-top:14px;color:var(--green2);font-weight:800;font-size:12px}}
.nota{{margin-top:38px;padding:18px 22px;border-left:5px solid #d7a945;border-radius:6px 16px 16px 6px;
background:#fff9e9;color:#654d17;line-height:1.6;font-size:14px}}
footer{{margin-top:30px;color:var(--muted);font-size:13px;line-height:1.6}}
</style>
</head>
<body>
<main>
<header>
<p class="eyebrow">Consulta pública • funciona offline</p>
<h1>Legislação tributária e urbana, sem juridiquês.</h1>
<p>Escolha o município. Cada versão reúne o Código Tributário, o Plano Diretor e as leis
correlatas em uma consulta pesquisável por página, que continua funcionando sem internet
depois do primeiro acesso.</p>
</header>
<div class="grid">
{cartoes}
</div>
<p class="nota"><strong>Guia educativo, não parecer jurídico.</strong> O texto da lei prevalece.
Confirme alterações, regulamentações, datas e valores com o Município antes de decidir ou autuar.</p>
<footer>
Para instalar no iPhone, abra o endereço do município no Safari e toque em Compartilhar →
Adicionar à Tela de Início. No Android e no computador, o navegador oferece o botão Instalar.
</footer>
</main>
</body>
</html>
"""

CARTAO = """<a class="card" href="./{slug}/">
<span class="seal">{sigla}</span>
<h2>{titulo}</h2>
<p>{descricao}</p>
<small>{documentos} documentos · {paginas} páginas pesquisáveis →</small>
</a>"""


def contar(slug: str) -> tuple[int, int]:
    bruto = (MUNICIPIOS / slug / "data" / "laws.js").read_text(encoding="utf-8")
    corpus = json.loads(json.loads(bruto[bruto.index("(") + 1 : bruto.rindex(")")]))
    return (
        len(corpus["documents"]),
        sum(d["pageCount"] for d in corpus["documents"]),
    )


def main() -> None:
    slugs = sorted(p.name for p in MUNICIPIOS.iterdir() if p.is_dir())
    cartoes = []
    for slug in slugs:
        build(slug, DOCS)
        cfg = json.loads((MUNICIPIOS / slug / "municipio.json").read_text(encoding="utf-8"))
        documentos, paginas = contar(slug)
        cartoes.append(
            CARTAO.format(
                slug=slug,
                sigla=cfg["marca"]["sigla"],
                titulo=cfg["marca"]["titulo"],
                descricao=f"{cfg['nome']} — {cfg['uf']}. {cfg['hero']['texto'].split('.')[0]}.",
                documentos=documentos,
                paginas=f"{paginas:,}".replace(",", "."),
            )
        )

    (DOCS / "index.html").write_text(
        CAPA.format(cartoes="\n".join(cartoes)), encoding="utf-8"
    )
    # sem isto o Pages roda Jekyll e ignora o que começa com underscore
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")
    total = sum(p.stat().st_size for p in DOCS.rglob("*") if p.is_file())
    print(f"docs/ — {len(slugs)} municípios, {total / 1048576:.2f} MB")


if __name__ == "__main__":
    main()
