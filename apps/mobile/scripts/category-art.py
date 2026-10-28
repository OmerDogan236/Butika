"""Butika kategori kapak çizimleri: SVG üretir. Chrome headless ile PNG'ye çevrilir."""
import math, pathlib

OUT = pathlib.Path(__file__).parent / "svg"
OUT.mkdir(exist_ok=True)
W, H = 600, 732

INK = "#2B2520"
CREAM = "#F8F5F0"
GOLD = "#9B7E5C"
GOLD_S = "#B89B7A"
CHAMP = "#DCC7A8"
CLAY = "#B23A48"
CLAY_S = "#D08C8F"
SAGE = "#7A8B6F"
SAGE_S = "#A9B59E"
LEATHER = "#6B4F3A"
LEATHER_D = "#553E2D"

TONES = {
    "blush": ("#EDE0DB", "#DFC9C2"),
    "sand": ("#EDE3D4", "#DDCBB2"),
    "sage": ("#E0E4D9", "#CAD2C0"),
    "mist": ("#E7E3DD", "#D5CEC4"),
    "stone": ("#E6DED3", "#D3C5B3"),
}

S = f'stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'


def hanger(y=186, x1=196, x2=404):
    return f'''<path d="M300 {y-44} C300 {y-58} 302 {y-64} 312 {y-72} C326 {y-82} 322 {y-100} 306 {y-100} C295 {y-100} 290 {y-93} 290 {y-86}" fill="none" stroke="{GOLD}" stroke-width="5" stroke-linecap="round"/>
<path d="M300 {y-44} L{x1} {y} H{x2} Z" fill="none" stroke="{GOLD}" stroke-width="5" stroke-linejoin="round"/>'''


def pearls():
    out = []
    n = 23
    for i in range(n):
        t = math.pi * i / (n - 1)
        x = 300 + 128 * math.cos(t)
        y = 150 + 226 * math.sin(t)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="13" fill="{CREAM}" {S}/>'
                   f'<circle cx="{x-4:.1f}" cy="{y-4:.1f}" r="3.5" fill="#fff"/>')
    return "".join(out)


ART = {
# ---------------------------------------------------------------- Abiye
"abiye": ("blush", f'''
{hanger()}
<path d="M258 186 L254 232 M342 186 L346 232" fill="none" {S}/>
<path d="M252 230 Q300 250 348 230 L336 322 C362 400 402 482 440 590 Q370 610 300 598 Q230 610 160 590 C198 482 238 400 264 322 Z" fill="{CHAMP}" {S}/>
<path d="M264 322 Q300 336 336 322" fill="none" {S}/>
<path d="M300 342 Q294 470 290 598 M318 338 Q346 470 378 604 M282 338 Q254 470 222 604" fill="none" stroke="{GOLD}" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
<path d="M270 250 Q286 262 282 300" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
'''),
# ---------------------------------------------------------------- Plaj
"plaj": ("sand", f'''
<circle cx="408" cy="196" r="46" fill="{GOLD_S}" opacity=".5"/>
<ellipse cx="300" cy="404" rx="196" ry="56" fill="{CHAMP}" {S}/>
<ellipse cx="300" cy="404" rx="150" ry="38" fill="none" stroke="{GOLD}" stroke-width="2" stroke-dasharray="3 9" opacity=".8"/>
<path d="M212 398 C208 316 246 280 300 280 C354 280 392 316 388 398 Q300 420 212 398 Z" fill="{CHAMP}" {S}/>
<path d="M216 362 Q300 382 384 362 L388 398 Q300 420 212 398 Z" fill="{CLAY}" {S}/>
<path d="M240 330 C250 305 270 295 290 292" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
<g transform="translate(0 20)">
<path d="M212 500 C212 470 236 460 256 460 C280 460 294 474 292 496 C290 522 272 536 250 536 C228 536 212 522 212 500 Z" fill="{INK}" {S}/>
<path d="M308 496 C306 474 320 460 344 460 C364 460 388 470 388 500 C388 522 372 536 350 536 C328 536 310 522 308 496 Z" fill="{INK}" {S}/>
<path d="M292 486 Q300 476 308 486" fill="none" {S}/>
<path d="M226 486 Q236 474 250 472 M322 486 Q332 474 346 472" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
</g>
'''),
# ---------------------------------------------------------------- Giyim
"gunlukgiyim": ("sage", f'''
<rect x="160" y="436" width="280" height="84" rx="12" fill="{GOLD_S}" {S}/>
<path d="M176 500 H424" fill="none" stroke="{INK}" stroke-width="2" stroke-dasharray="2 7" opacity=".6"/>
<rect x="176" y="354" width="248" height="84" rx="12" fill="{CREAM}" {S}/>
<path d="M190 418 H410" fill="none" stroke="{INK}" stroke-width="2" stroke-dasharray="2 7" opacity=".6"/>
<rect x="192" y="272" width="216" height="84" rx="12" fill="{CLAY_S}" {S}/>
<path d="M266 272 Q300 306 334 272" fill="{CREAM}" {S}/>
<path d="M244 280 V350 M356 280 V350" fill="none" stroke="{INK}" stroke-width="2" opacity=".35"/>
<path d="M204 336 H396" fill="none" stroke="{INK}" stroke-width="2" stroke-dasharray="2 7" opacity=".6"/>
<path d="M380 206 L420 246 L402 266 L362 226 Z" fill="{CREAM}" {S}/>
<circle cx="372" cy="226" r="4" fill="{INK}"/>
<path d="M368 222 C340 200 320 230 300 272" fill="none" stroke="{GOLD}" stroke-width="2.5" stroke-linecap="round"/>
'''),
# ---------------------------------------------------------------- Aksesuar
"aksesuar": ("mist", f'''
<path d="M300 140 L460 320 L300 500 L140 320 Z" fill="{CLAY_S}" {S}/>
<path d="M300 176 L428 320 L300 464 L172 320 Z" fill="none" stroke="{CREAM}" stroke-width="3" stroke-dasharray="1 10" stroke-linecap="round"/>
<path d="M300 212 L396 320 L300 428 L204 320 Z" fill="none" stroke="{GOLD}" stroke-width="2" opacity=".8"/>
<ellipse cx="238" cy="330" rx="54" ry="42" fill="{INK}" {S}/>
<ellipse cx="362" cy="330" rx="54" ry="42" fill="{INK}" {S}/>
<path d="M290 318 Q300 304 310 318" fill="none" stroke="{INK}" stroke-width="5"/>
<path d="M184 320 L150 300 M416 320 L450 300" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>
<path d="M212 318 Q222 304 238 302 M336 318 Q346 304 362 302" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>
<circle cx="392" cy="468" r="26" fill="none" stroke="{GOLD}" stroke-width="7"/>
<circle cx="430" cy="486" r="18" fill="none" stroke="{GOLD_S}" stroke-width="6"/>
'''),
# ---------------------------------------------------------------- Güzellik
"guzellik": ("blush", f'''
<ellipse cx="300" cy="506" rx="190" ry="16" fill="{INK}" opacity=".08"/>
<circle cx="208" cy="420" r="80" fill="{CHAMP}" {S}/>
<circle cx="208" cy="420" r="60" fill="{TONES['blush'][1]}" {S}/>
<path d="M176 392 Q190 376 212 372" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
<path d="M314 272 L314 214 L360 188 L360 272 Z" fill="{CLAY}" {S}/>
<rect x="306" y="268" width="62" height="64" rx="4" fill="{GOLD_S}" {S}/>
<rect x="296" y="330" width="82" height="170" rx="6" fill="{GOLD}" {S}/>
<path d="M312 346 V484" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>
<rect x="414" y="300" width="36" height="58" rx="6" fill="{INK}" {S}/>
<rect x="398" y="356" width="68" height="144" rx="18" fill="{SAGE_S}" {S}/>
<rect x="410" y="400" width="44" height="50" rx="4" fill="{CREAM}" opacity=".9"/>
'''),
# ---------------------------------------------------------------- Mücevher
"mucevher": ("sand", f'''
<path d="M172 150 Q300 510 428 150" fill="none" stroke="{GOLD}" stroke-width="2"/>
{pearls()}
<path d="M300 388 L322 420 L300 470 L278 420 Z" fill="{GOLD_S}" {S}/>
<path d="M286 420 H314" fill="none" stroke="{CREAM}" stroke-width="2"/>
<circle cx="412" cy="486" r="32" fill="none" stroke="{GOLD}" stroke-width="10"/>
<path d="M396 452 L412 430 L428 452 L412 462 Z" fill="{CREAM}" {S}/>
'''),
# ---------------------------------------------------------------- Spor Giyim
"sporgiyim": ("sage", f'''
<ellipse cx="300" cy="500" rx="190" ry="14" fill="{INK}" opacity=".08"/>
<path d="M170 380 H388 A30 60 0 0 1 388 500 H170 Z" fill="{CLAY_S}" {S}/>
<ellipse cx="170" cy="440" rx="30" ry="60" fill="{CLAY_S}" {S}/>
<path d="M170 440 m-4 0 a8 12 0 1 1 16 0 a14 22 0 1 1 -28 0 a20 32 0 1 1 40 0" fill="none" stroke="{INK}" stroke-width="2.5"/>
<path d="M254 380 V500 M286 380 V500" fill="none" {S}/>
<rect x="254" y="380" width="32" height="120" fill="{INK}" opacity=".85"/>
<path d="M230 400 H360" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>
<rect x="424" y="236" width="44" height="34" rx="6" fill="{INK}" {S}/>
<rect x="408" y="266" width="76" height="236" rx="22" fill="{CREAM}" {S}/>
<rect x="408" y="330" width="76" height="70" fill="{SAGE_S}" {S}/>
<path d="M424 290 V480" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
'''),
# ---------------------------------------------------------------- Hamile Giyim
"hamile-giyim": ("mist", f'''
<rect x="290" y="132" width="24" height="46" rx="4" fill="{GOLD}" {S}/>
<circle cx="302" cy="126" r="12" fill="{GOLD}" {S}/>
<path d="M290 178 C268 190 258 214 260 244 C262 284 254 324 252 364 C248 424 236 484 222 548 L386 548 C378 506 368 474 366 444 C400 424 408 372 388 332 C372 306 356 300 350 290 C364 270 366 242 352 218 C342 202 326 188 314 178 Z" fill="{CLAY_S}" {S}/>
<path d="M258 292 Q306 304 352 292" fill="none" {S}/>
<path d="M344 296 C356 320 350 340 340 356 M344 296 C368 312 376 330 372 350" fill="none" {S}/>
<path d="M302 196 C324 222 332 252 324 282" fill="none" stroke="{INK}" stroke-width="2.5" opacity=".5"/>
<path d="M290 320 C286 400 280 470 272 548 M330 340 C334 420 340 480 350 548" fill="none" stroke="{CREAM}" stroke-width="2.5" opacity=".6"/>
<path d="M376 350 Q394 380 382 420" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
<path d="M300 548 V606 M300 606 L250 632 M300 606 L350 632" fill="none" stroke="{GOLD}" stroke-width="6" stroke-linecap="round"/>
'''),
# ---------------------------------------------------------------- İç Giyim
"icgiyim": ("stone", f'''
{hanger(y=190)}
<path d="M246 190 L262 244 M354 190 L338 244" fill="none" {S}/>
<path d="M212 336 L262 236 Q284 290 298 336 Z" fill="{CLAY_S}" {S}/>
<path d="M302 336 Q316 290 338 236 L388 336 Z" fill="{CLAY_S}" {S}/>
<path d="M236 318 L262 262 L280 318 M320 318 L338 262 L364 318" fill="none" stroke="{CREAM}" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>
<rect x="204" y="334" width="192" height="30" rx="6" fill="{CLAY_S}" {S}/>
<path d="M206 364 {' '.join(f'q8 12 16 0' for _ in range(12))}" fill="none" {S}/>
<path d="M292 336 q-14 -14 -2 -20 q10 -4 10 12 q0 -16 10 -12 q12 6 -2 20" fill="{CREAM}" {S}/>
<path d="M226 436 Q300 456 374 436 L350 510 Q300 540 250 510 Z" fill="{CLAY_S}" {S}/>
<path d="M228 446 {' '.join(f'q7 10 14 0' for _ in range(11))}" fill="none" stroke="{CREAM}" stroke-width="2.2"/>
'''),
# ---------------------------------------------------------------- Eşarp
"esarp": ("blush", f'''
<circle cx="300" cy="160" r="26" fill="none" stroke="{GOLD}" stroke-width="7"/>
<path d="M300 204 C262 252 232 356 206 520 L276 534 C284 404 298 300 312 226 Z" fill="{CHAMP}" {S}/>
<path d="M300 204 C334 276 374 380 408 506 L350 526 C328 412 306 322 290 232 Z" fill="{GOLD_S}" {S}/>
<path d="M226 506 L272 514 M390 492 L346 508" fill="none" stroke="{CLAY}" stroke-width="7"/>
<path d="M210 522 l-4 22 M226 525 l-3 22 M242 528 l-2 22 M258 531 l-1 22 M272 534 l0 22 M352 528 l2 22 M366 523 l4 22 M380 518 l5 21 M394 512 l6 21 M406 508 l6 20" fill="none" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>
<g fill="{CLAY}"><circle cx="266" cy="300" r="5"/><circle cx="252" cy="360" r="5"/><circle cx="240" cy="420" r="5"/><circle cx="262" cy="450" r="5"/><circle cx="276" cy="380" r="5"/></g>
<g fill="{CREAM}"><circle cx="330" cy="310" r="5"/><circle cx="350" cy="380" r="5"/><circle cx="370" cy="440" r="5"/><circle cx="340" cy="460" r="5"/><circle cx="322" cy="370" r="5"/></g>
<ellipse cx="300" cy="206" rx="30" ry="22" fill="{CLAY}" {S}/>
'''),
# ---------------------------------------------------------------- Tesettür
"tesettur": ("sand", f'''
{hanger()}
<path d="M214 190 C188 244 170 324 156 414 L194 422 C204 344 214 284 226 252 Z" fill="{SAGE_S}" {S}/>
<path d="M386 190 C412 244 430 324 444 414 L406 422 C396 344 386 284 374 252 Z" fill="{SAGE_S}" {S}/>
<path d="M214 190 Q300 176 386 190 L380 252 C392 362 420 482 440 594 Q300 616 160 594 C180 482 208 362 220 252 Z" fill="{SAGE_S}" {S}/>
<path d="M270 300 Q264 450 250 604 M330 300 Q336 450 350 604" fill="none" stroke="{SAGE}" stroke-width="2.5" opacity=".8"/>
<path d="M234 180 Q300 202 366 180 L376 340 Q358 352 340 340 L334 222 Q300 236 266 222 L260 340 Q242 352 224 340 Z" fill="{CHAMP}" {S}/>
<path d="M240 250 L244 330 M360 250 L356 330" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
'''),
# ---------------------------------------------------------------- Büyük Beden
"buyukbeden": ("sage", f'''
{hanger(x1=190, x2=410)}
<path d="M206 190 C174 212 156 252 152 296 L206 300 Z" fill="{GOLD_S}" {S}/>
<path d="M394 190 C426 212 444 252 448 296 L394 300 Z" fill="{GOLD_S}" {S}/>
<path d="M206 188 Q300 176 394 188 L406 302 C424 382 444 452 456 544 Q300 572 144 544 C156 452 176 382 194 302 Z" fill="{GOLD_S}" {S}/>
<path d="M250 186 L324 336 M350 186 L284 304" fill="none" {S}/>
<path d="M324 336 l40 70 M324 336 l14 84" fill="none" stroke="{CLAY}" stroke-width="6" stroke-linecap="round"/>
<circle cx="324" cy="336" r="9" fill="{CLAY}" {S}/>
<g fill="{CREAM}" opacity=".85"><circle cx="226" cy="260" r="4"/><circle cx="360" cy="250" r="4"/><circle cx="236" cy="380" r="4"/><circle cx="210" cy="480" r="4"/><circle cx="290" cy="440" r="4"/><circle cx="380" cy="400" r="4"/><circle cx="400" cy="500" r="4"/><circle cx="330" cy="510" r="4"/><circle cx="260" cy="520" r="4"/><circle cx="370" cy="320" r="4"/></g>
'''),
# ---------------------------------------------------------------- Çanta
"canta": ("mist", f'''
<ellipse cx="300" cy="548" rx="180" ry="14" fill="{INK}" opacity=".08"/>
<path d="M226 330 C226 206 374 206 374 330" fill="none" stroke="{INK}" stroke-width="20" stroke-linecap="round"/>
<path d="M226 330 C226 206 374 206 374 330" fill="none" stroke="{GOLD}" stroke-width="13" stroke-linecap="round"/>
<path d="M172 324 H428 L452 520 Q454 542 432 542 H168 Q146 542 148 520 Z" fill="{GOLD}" {S}/>
<path d="M172 324 H428 L422 416 Q300 456 178 416 Z" fill="#846A4D" {S}/>
<path d="M188 340 H412 L408 404 Q300 438 192 404 Z" fill="none" stroke="{CHAMP}" stroke-width="2" stroke-dasharray="4 7"/>
<circle cx="300" cy="438" r="15" fill="{CHAMP}" {S}/>
<path d="M186 440 L172 520" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"/>
'''),
# ---------------------------------------------------------------- Hediyelik
"hediyelik": ("stone", f'''
<ellipse cx="300" cy="534" rx="170" ry="14" fill="{INK}" opacity=".08"/>
<rect x="182" y="340" width="236" height="192" fill="{CREAM}" {S}/>
<rect x="166" y="298" width="268" height="54" rx="4" fill="{CREAM}" {S}/>
<rect x="282" y="298" width="36" height="234" fill="{CLAY}" {S}/>
<path d="M300 298 C258 226 200 244 228 292 C244 308 280 302 300 298 Z" fill="{CLAY}" {S}/>
<path d="M300 298 C342 226 400 244 372 292 C356 308 320 302 300 298 Z" fill="{CLAY}" {S}/>
<path d="M290 300 L262 352 M310 300 L338 352" fill="none" stroke="{CLAY}" stroke-width="9" stroke-linecap="round"/>
<ellipse cx="300" cy="296" rx="16" ry="12" fill="{CLAY_S}" {S}/>
<path d="M200 330 H270" fill="none" stroke="{GOLD}" stroke-width="2" opacity=".5"/>
<path d="M452 540 C448 440 436 340 410 250" fill="none" stroke="{SAGE}" stroke-width="3"/>
<g fill="{SAGE_S}" stroke="{SAGE}" stroke-width="2">
<ellipse cx="428" cy="290" rx="14" ry="20" transform="rotate(-30 428 290)"/><ellipse cx="452" cy="330" rx="14" ry="20" transform="rotate(30 452 330)"/>
<ellipse cx="434" cy="380" rx="14" ry="20" transform="rotate(-30 434 380)"/><ellipse cx="462" cy="420" rx="14" ry="20" transform="rotate(30 462 420)"/>
<ellipse cx="444" cy="468" rx="14" ry="20" transform="rotate(-30 444 468)"/></g>
'''),
# ---------------------------------------------------------------- Kids Corner
"kidscorner": ("blush", f'''
<path d="M430 150 l14 30 33 4 -24 22 7 33 -30 -17 -30 17 7 -33 -24 -22 33 -4 Z" fill="{GOLD_S}" {S}/>
<path d="M252 260 L236 192 M348 260 L364 192" fill="none" stroke="{INK}" stroke-width="16" stroke-linecap="round"/>
<path d="M252 260 L236 192 M348 260 L364 192" fill="none" stroke="{SAGE_S}" stroke-width="10" stroke-linecap="round"/>
<path d="M246 256 H354 L360 336 H240 Z" fill="{SAGE_S}" {S}/>
<circle cx="258" cy="274" r="7" fill="{GOLD}" {S}/><circle cx="342" cy="274" r="7" fill="{GOLD}" {S}/>
<rect x="276" y="286" width="48" height="34" rx="4" fill="none" {S}/>
<path d="M226 334 H374 L392 526 H316 L300 420 L284 526 H208 Z" fill="{SAGE_S}" {S}/>
<path d="M210 500 H282 M318 500 H390" fill="none" {S}/>
<path d="M300 336 V420" fill="none" stroke="{INK}" stroke-width="2" opacity=".5"/>
<path d="M246 360 V470" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
'''),
# ---------------------------------------------------------------- Parfüm
"parfumkoku": ("sand", f'''
<ellipse cx="300" cy="530" rx="160" ry="14" fill="{INK}" opacity=".08"/>
<rect x="250" y="176" width="100" height="88" rx="8" fill="{INK}" {S}/>
<rect x="268" y="262" width="64" height="32" fill="{GOLD}" {S}/>
<rect x="196" y="292" width="208" height="232" rx="28" fill="{CREAM}" fill-opacity=".75" {S}/>
<rect x="218" y="360" width="164" height="144" rx="16" fill="{GOLD_S}" opacity=".85"/>
<rect x="250" y="400" width="100" height="44" fill="{CREAM}" {S}/>
<path d="M270 422 H330" fill="none" stroke="{GOLD}" stroke-width="2"/>
<path d="M218 316 V480" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>
<path d="M438 520 C432 440 426 380 400 320" fill="none" stroke="{SAGE}" stroke-width="3"/>
<g stroke="{INK}" stroke-width="2"><circle cx="400" cy="312" r="14" fill="{CLAY_S}"/><circle cx="424" cy="352" r="12" fill="{CLAY_S}"/><circle cx="408" cy="378" r="10" fill="{CREAM}"/><circle cx="436" cy="410" r="11" fill="{CLAY_S}"/></g>
<path d="M170 190 q-14 -20 0 -40 q14 -20 0 -40 M140 210 q-12 -16 0 -32" fill="none" stroke="{GOLD}" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>
'''),
# ---------------------------------------------------------------- Baştan Çıkar
"bastancikar": ("stone", f'''
<path d="M236 280 C250 360 256 430 250 520" fill="none" stroke="{SAGE}" stroke-width="4"/>
<path d="M244 380 C210 360 196 370 190 390 C214 398 232 396 244 380 Z" fill="{SAGE_S}" stroke="{SAGE}" stroke-width="2"/>
<path d="M190 250 C186 206 214 186 238 190 C266 194 284 216 278 252 C272 284 246 292 226 290 C204 288 192 272 190 250 Z" fill="{CLAY}" {S}/>
<path d="M236 244 m0 0 c-8 -6 -2 -18 8 -16 c14 4 12 24 -4 28 c-20 4 -30 -18 -20 -32 c12 -16 40 -12 44 10" fill="none" stroke="{CREAM}" stroke-width="2.5" stroke-linecap="round" opacity=".75"/>
<path d="M150 512 C150 480 190 468 238 470 C282 472 318 420 356 380 C380 356 406 356 416 378 L426 424 L412 562 L400 562 L396 446 C366 454 312 508 250 518 C206 524 158 530 150 512 Z" fill="{CLAY}" {S}/>
<path d="M232 474 C286 474 322 424 360 388" fill="none" stroke="{CREAM}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
<path d="M172 504 C200 498 222 496 240 496" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
'''),
# ---------------------------------------------------------------- Deri
"deri": ("sand", f'''
{hanger()}
<path d="M202 190 C170 226 160 330 156 454 L196 456 L210 300 Z" fill="{LEATHER}" {S}/>
<path d="M398 190 C430 226 440 330 444 454 L404 456 L390 300 Z" fill="{LEATHER}" {S}/>
<path d="M202 188 Q300 176 398 188 L412 472 H188 Z" fill="{LEATHER}" {S}/>
<path d="M248 186 L300 282 L262 304 L220 206 Z" fill="{LEATHER_D}" {S}/>
<path d="M352 186 L336 214 L384 300 L334 334 L300 282 Z" fill="{LEATHER_D}" {S}/>
<path d="M300 282 L344 470" fill="none" stroke="{GOLD_S}" stroke-width="4" stroke-dasharray="3 5"/>
<rect x="188" y="440" width="224" height="32" fill="{LEATHER_D}" {S}/>
<rect x="222" y="444" width="28" height="24" rx="3" fill="none" stroke="{GOLD_S}" stroke-width="4"/>
<path d="M220 250 C216 310 214 370 214 420 M176 240 C168 300 166 360 166 420" fill="none" stroke="{CREAM}" stroke-width="3" stroke-linecap="round" opacity=".3"/>
<circle cx="236" cy="220" r="4" fill="{GOLD_S}"/><circle cx="370" cy="272" r="4" fill="{GOLD_S}"/>
'''),
# ---------------------------------------------------------------- Şık Ev Giyimi
"sikevgiyimi": ("mist", f'''
<path d="M300 120 V150 M284 150 H316" fill="none" stroke="{GOLD}" stroke-width="6" stroke-linecap="round"/>
<path d="M206 214 C180 266 166 360 168 424 L214 428 L224 300 Z" fill="{CLAY_S}" {S}/>
<path d="M394 214 C420 266 434 360 432 424 L386 428 L376 300 Z" fill="{CLAY_S}" {S}/>
<path d="M300 158 C258 158 220 180 206 212 L186 552 Q300 574 414 552 L394 212 C380 180 342 158 300 158 Z" fill="{CLAY_S}" {S}/>
<path d="M272 166 C262 262 280 346 310 404 M330 166 C342 262 334 334 310 404" fill="none" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>
<path d="M272 166 C262 262 280 346 310 404 M330 166 C342 262 334 334 310 404" fill="none" {S}/>
<path d="M190 402 Q300 424 410 402" fill="none" stroke="{INK}" stroke-width="14" stroke-linecap="round"/>
<path d="M190 402 Q300 424 410 402" fill="none" stroke="{CREAM}" stroke-width="8" stroke-linecap="round"/>
<path d="M320 412 L338 500 M310 414 L302 506" fill="none" stroke="{INK}" stroke-width="13" stroke-linecap="round"/>
<path d="M320 412 L338 500 M310 414 L302 506" fill="none" stroke="{CREAM}" stroke-width="7" stroke-linecap="round"/>
<path d="M226 240 C216 320 210 420 206 520" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>
<path d="M366 440 C370 480 374 520 378 552" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"/>
'''),
# ---------------------------------------------------------------- Organik Bebek
"organikbebekgiyim": ("sage", f'''
<path d="M250 196 C272 222 328 222 350 196 L424 238 L402 304 L370 292 L372 468 C372 500 344 510 324 518 L300 540 L276 518 C256 510 228 500 228 468 L230 292 L198 304 L176 238 Z" fill="{CREAM}" {S}/>
<path d="M250 196 C272 236 328 236 350 196" fill="none" {S}/>
<path d="M204 248 L192 290 M396 248 L408 290" fill="none" stroke="{SAGE}" stroke-width="2.5" stroke-dasharray="2 6" stroke-linecap="round"/>
<g fill="{GOLD_S}" {S}><circle cx="282" cy="506" r="5"/><circle cx="300" cy="512" r="5"/><circle cx="318" cy="506" r="5"/></g>
<path d="M300 420 C300 380 302 350 312 320" fill="none" stroke="{SAGE}" stroke-width="3"/>
<g fill="{SAGE_S}" stroke="{SAGE}" stroke-width="2.4">
<path d="M303 380 C280 372 268 352 272 336 C292 340 304 360 303 380 Z"/>
<path d="M306 350 C326 340 336 320 332 304 C312 310 302 330 306 350 Z"/></g>
<path d="M470 520 C466 440 456 360 440 290" fill="none" stroke="{GOLD}" stroke-width="3"/>
<g fill="#fff" {S}><circle cx="440" cy="272" r="16"/><circle cx="426" cy="258" r="13"/><circle cx="454" cy="256" r="13"/><circle cx="440" cy="244" r="12"/></g>
<path d="M426 286 L440 296 L454 286" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>
'''),
# ---------------------------------------------------------------- Ayakkabı
"ayakkabi": ("blush", f'''
<ellipse cx="300" cy="512" rx="190" ry="12" fill="{INK}" opacity=".08"/>
<g transform="translate(54 -92)">
<path d="M150 500 C176 470 230 452 290 448 C330 446 356 420 380 410 L408 406 C424 406 432 420 430 440 L426 470 L418 590 L402 590 L396 484 C360 488 300 498 250 502 C210 504 160 510 150 500 Z" fill="{CHAMP}" {S}/>
<path d="M396 484 L402 590 H418 L426 470" fill="{GOLD}" {S}/>
<path d="M288 450 C320 470 370 454 386 412" fill="none" {S}/>
</g>
<path d="M120 500 C146 470 200 452 260 448 C300 446 326 420 350 410 L378 406 C394 406 402 420 400 440 L396 470 L388 590 L372 590 L366 484 C330 488 270 498 220 502 C180 504 130 510 120 500 Z" fill="{GOLD}" {S}/>
<path d="M366 484 L372 590 H388 L396 470" fill="#846A4D" {S}/>
<path d="M258 450 C290 470 340 454 356 412" fill="none" {S}/>
<path d="M300 462 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0" fill="{CHAMP}" {S}/>
<path d="M148 486 C180 470 214 462 240 462" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>
'''),
# ---------------------------------------------------------------- Kiralık
"kiralik": ("sand", f'''
<path d="M140 150 H460 M150 150 V620 M450 150 V620" fill="none" stroke="{GOLD}" stroke-width="7" stroke-linecap="round"/>
''' + "".join(
    f'''<path d="M{x} 150 C{x} 166 {x} 172 {x} 180 M{x} 180 L{x-46} 204 H{x+46} Z" fill="none" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M{x-36} 204 Q{x} 196 {x+36} 204 L{x+30} 270 C{x+40} {330+ln} {x+52} {400+ln} {x+60} {470+ln} Q{x} {486+ln} {x-60} {470+ln} C{x-52} {400+ln} {x-40} {330+ln} {x-30} 270 Z" fill="{c}" {S}/>
<path d="M{x-30} 270 Q{x} 280 {x+30} 270" fill="none" {S}/>'''
    for x, c, ln in [(222, CHAMP, 20), (378, SAGE_S, -10), (300, CLAY_S, 50)]
) + f'''
<path d="M300 186 C330 210 352 236 356 262" fill="none" stroke="{INK}" stroke-width="2"/>
<g transform="rotate(18 362 290)"><rect x="340" y="262" width="44" height="62" rx="5" fill="{CREAM}" {S}/><circle cx="362" cy="276" r="5" fill="none" {S}/><path d="M350 298 H374 M350 310 H368" fill="none" stroke="{GOLD}" stroke-width="2.5"/></g>
'''),
# ---------------------------------------------------------------- Bridal
"bridal": ("mist", f'''
<path d="M300 96 C206 128 158 300 136 620 H464 C442 300 394 128 300 96 Z" fill="{CREAM}" opacity=".6"/>
<path d="M136 620 C150 330 200 140 300 96 C400 140 450 330 464 620" fill="none" stroke="{GOLD_S}" stroke-width="2" stroke-dasharray="1 8" stroke-linecap="round"/>
<path d="M278 400 L292 564 M300 400 L300 568 M322 400 L308 564" fill="none" stroke="{SAGE}" stroke-width="4" stroke-linecap="round"/>
<path d="M276 450 L324 450 L318 490 L282 490 Z" fill="{CHAMP}" {S}/>
<path d="M300 490 C290 520 270 540 256 548 M300 490 C310 520 330 540 346 552" fill="none" stroke="{CHAMP}" stroke-width="7" stroke-linecap="round"/>
<g fill="{SAGE_S}" stroke="{SAGE}" stroke-width="2.4">
<ellipse cx="196" cy="340" rx="18" ry="34" transform="rotate(-50 196 340)"/><ellipse cx="404" cy="336" rx="18" ry="34" transform="rotate(50 404 336)"/>
<ellipse cx="226" cy="410" rx="16" ry="30" transform="rotate(-30 226 410)"/><ellipse cx="376" cy="408" rx="16" ry="30" transform="rotate(30 376 408)"/></g>
''' + "".join(
    f'''<circle cx="{x}" cy="{y}" r="{r}" fill="{f}" {S}/><path d="M{x} {y} m-{r*0.25:.0f} 0 a{r*0.25:.0f} {r*0.25:.0f} 0 1 1 {r*0.5:.0f} 0 a{r*0.5:.0f} {r*0.5:.0f} 0 1 1 -{r*0.9:.0f} 0" fill="none" stroke="{GOLD}" stroke-width="2.2"/>'''
    for x, y, r, f in [(250, 320, 46, CREAM), (352, 318, 44, "#F1DFDB"), (300, 270, 42, "#F1DFDB"), (300, 360, 44, CREAM), (224, 380, 30, CREAM), (378, 378, 30, CREAM)]
)),
# ---------------------------------------------------------------- Kayak
"kayak": ("sage", f'''
<g fill="none" stroke="{CREAM}" stroke-width="3" stroke-linecap="round">
<path d="M130 180 v36 M112 198 h36 M117 185 l26 26 M143 185 l-26 26"/>
<path d="M470 260 v28 M456 274 h28 M460 264 l20 20 M480 264 l-20 20"/></g>
<circle cx="300" cy="176" r="42" fill="{CREAM}" {S}/>
<path d="M280 160 l6 6 M306 150 l4 8 M318 176 l6 4 M288 190 l6 -4" fill="none" stroke="{GOLD}" stroke-width="2.5" stroke-linecap="round"/>
<path d="M190 386 C190 266 240 212 300 212 C360 212 410 266 410 386 Z" fill="{CLAY}" {S}/>
<path d="M226 300 l24 20 24 -20 26 20 26 -20 24 20 24 -20 M214 340 l26 20 26 -20 34 20 34 -20 26 20 26 -20" fill="none" stroke="{CREAM}" stroke-width="3" stroke-linejoin="round" opacity=".85"/>
<rect x="176" y="372" width="248" height="72" rx="14" fill="{CLAY_S}" {S}/>
<path d="{' '.join(f'M{x} 382 V434' for x in range(200, 410, 18))}" fill="none" stroke="{INK}" stroke-width="2" opacity=".35"/>
<path d="M130 492 Q300 512 470 492" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>
<rect x="196" y="452" width="208" height="92" rx="46" fill="{INK}" {S}/>
<path d="M222 500 C236 474 270 466 300 466 M330 468 C360 472 384 486 390 506" fill="none" stroke="{GOLD_S}" stroke-width="5" stroke-linecap="round"/>
'''),
# ---------------------------------------------------------------- Tasarımcılar
"tasarimcilar": ("stone", f'''
<g transform="rotate(-7 280 320)">
<rect x="160" y="150" width="240" height="330" fill="{CREAM}" {S}/>
<circle cx="280" cy="206" r="12" fill="none" stroke="{INK}" stroke-width="2"/>
<path d="M280 218 V232 M254 236 Q280 230 306 236 L298 300 C312 350 330 400 344 450 Q280 462 216 450 C230 400 248 350 262 300 Z" fill="none" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M262 300 Q280 308 298 300" fill="none" stroke="{CLAY}" stroke-width="2.2"/>
<path d="M186 176 H230 M186 190 H216" fill="none" stroke="{GOLD}" stroke-width="2"/>
</g>
<ellipse cx="428" cy="410" rx="44" ry="14" fill="{GOLD_S}" {S}/>
<rect x="394" y="410" width="68" height="100" fill="{CLAY}" {S}/>
<path d="M394 430 H462 M394 450 H462 M394 470 H462 M394 490 H462" fill="none" stroke="{CREAM}" stroke-width="1.8" opacity=".6"/>
<path d="M384 510 H472 V526 H384 Z M384 394 H472 V410 H384 Z" fill="{GOLD_S}" {S}/>
<path d="M428 394 C420 350 380 340 344 360" fill="none" stroke="{CLAY}" stroke-width="2.5" stroke-linecap="round"/>
<g transform="rotate(-18 250 520)">
<path d="M236 512 L380 480 L236 528 Z" fill="#D5D8DB" {S}/>
<path d="M236 528 L380 560 L236 512 Z" fill="#C3C7CB" {S}/>
<circle cx="208" cy="496" r="22" fill="none" stroke="{INK}" stroke-width="13"/><circle cx="208" cy="496" r="22" fill="none" stroke="{GOLD}" stroke-width="8"/>
<circle cx="208" cy="546" r="22" fill="none" stroke="{INK}" stroke-width="13"/><circle cx="208" cy="546" r="22" fill="none" stroke="{GOLD}" stroke-width="8"/>
<circle cx="238" cy="520" r="5" fill="{INK}"/>
</g>
'''),
}


def frame(slug, tone, body):
    bg, arch = TONES[tone]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs>
<filter id="grain" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/>
<feColorMatrix values="0 0 0 0 0.17  0 0 0 0 0.14  0 0 0 0 0.11  0 0 0 0.09 0"/>
</filter>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
<stop offset="0.6" stop-color="#2A2119" stop-opacity="0"/>
<stop offset="1" stop-color="#2A2119" stop-opacity="0.5"/>
</linearGradient>
</defs>
<rect width="{W}" height="{H}" fill="{bg}"/>
<path d="M110 {H} V300 A190 190 0 0 1 490 300 V{H} Z" fill="{arch}"/>
<path d="M0 600 H{W}" stroke="{arch}" stroke-width="2"/>
<g transform="translate(300 360) scale(1.13) translate(-300 -360)">{body}</g>
<rect width="{W}" height="{H}" filter="url(#grain)"/>
<rect width="{W}" height="{H}" fill="url(#fade)"/>
</svg>'''


for slug, (tone, body) in ART.items():
    (OUT / f"{slug}.svg").write_text(frame(slug, tone, body))
print(len(ART), "svg yazıldı")
