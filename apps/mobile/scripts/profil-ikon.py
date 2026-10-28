"""Profil sayfası bölüm başlığı çizimleri: SVG üretir, Chrome headless ile saydam PNG'ye çevrilir.

Kategori kapaklarıyla (category-art.py) aynı çizim dili: mürekkep konturlar, altın vurgu,
yumuşak dolgu. Ölçü 96×96 — ekranda 30 punto gösterildiği için 3x çözünürlük.

Kullanım:
    python3 scripts/profil-ikon.py
    for f in scripts/svg-profil/*.svg; do \
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
        --default-background-color=00000000 --window-size=96,96 \
        --screenshot="assets/profil/$(basename "${f%.svg}").png" "$f"; done
"""

import pathlib

OUT = pathlib.Path(__file__).parent / "svg-profil"
OUT.mkdir(exist_ok=True)

INK = "#2B2520"
GOLD = "#9B7E5C"
CHAMP = "#DCC7A8"
BLUSH = "#EDE0DB"
SAGE = "#E0E4D9"
SAND = "#EDE3D4"

# NOT: S/SG yalnız kontur tanımlar — `fill` her elemanda ayrı verilir; ikisi birden
# yazılırsa bazı SVG çözücüleri "attribute fill redefined" deyip dosyayı çizmiyor.
S = f'stroke="{INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"'
SG = f'stroke="{GOLD}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"'

ART = {
    # Sana haber var — bildirim zili, altın ışıltılarla
    "haber": f'''
<path d="M30 58 C30 42 34 30 48 30 C62 30 66 42 66 58 L72 66 H24 Z" fill="{BLUSH}" {S}/>
<path d="M42 72 C43 78 53 78 54 72" fill="none" {S}/>
<path d="M48 30 V22" fill="none" {S}/>
<path d="M74 28 L80 22 M76 40 L84 38 M22 28 L16 22" fill="none" {SG}/>
''',
    # Takipte — fiyat etiketi ve aşağı inen ok
    "takip": f'''
<path d="M20 44 L44 20 H72 V48 L48 72 Z" fill="{SAND}" {S}/>
<circle cx="61" cy="31" r="5" fill="#fff" {S}/>
<path d="M36 52 V72 M30 66 L36 73 L42 66" fill="none" {SG}/>
''',
    # Satın Aldıklarım — alışveriş poşeti
    "satin": f'''
<path d="M24 34 H72 L76 78 H20 Z" fill="{CHAMP}" {S}/>
<path d="M38 34 V26 C38 18 58 18 58 26 V34" fill="none" {S}/>
<path d="M32 50 H64" fill="none" {SG}/>
''',
    # Tarzın — askı ve yıldız
    "tarz": f'''
<path d="M48 34 C48 28 52 26 52 22 C52 17 44 17 44 22" fill="none" {S}/>
<path d="M48 34 L18 58 H78 Z" fill="{SAGE}" {S}/>
<path d="M72 22 L75 30 L83 33 L75 36 L72 44 L69 36 L61 33 L69 30 Z" fill="{GOLD}" stroke="none"/>
''',
    # Rozetlerin — madalya ve kurdele
    "rozet": f'''
<circle cx="48" cy="40" r="20" fill="{CHAMP}" {S}/>
<path d="M48 31 L51 38 L58 38 L52 43 L54 50 L48 46 L42 50 L44 43 L38 38 L45 38 Z" fill="{GOLD}" stroke="none"/>
<path d="M36 57 L30 80 L48 72 L66 80 L60 57" fill="none" {S}/>
''',
    # Son gezdiklerin — butik vitrini, tenteli
    "gezilen": f'''
<path d="M20 40 L26 24 H70 L76 40 Z" fill="{BLUSH}" {S}/>
<path d="M24 40 V78 H72 V40" fill="none" {S}/>
<path d="M38 78 V56 H58 V78" fill="#fff" {S}/>
<path d="M30 48 H34 M62 48 H66" fill="none" {SG}/>
''',
    # Sana önerilen butikler — alışveriş çantası ve altın yıldız
    "oneri": f'''
<path d="M24 40 H68 L64 80 H28 Z" fill="{SAND}" {S}/>
<path d="M36 40 C36 26 56 26 56 40" fill="none" {S}/>
<path d="M76 16 L79 25 L88 28 L79 31 L76 40 L73 31 L64 28 L73 25 Z" fill="{CHAMP}" {SG}/>
''',
}


def frame(body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">'
        f"{body}</svg>"
    )


for slug, body in ART.items():
    (OUT / f"{slug}.svg").write_text(frame(body))
print(len(ART), "svg yazıldı:", OUT)
