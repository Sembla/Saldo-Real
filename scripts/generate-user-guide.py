from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "manual-saldo-real.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 42
INK = HexColor("#10231D")
INK_SOFT = HexColor("#29443A")
PAPER = HexColor("#F4F1E8")
SURFACE = HexColor("#FFFDF7")
LIME = HexColor("#C9F166")
LIME_DARK = HexColor("#83AA2C")
CORAL = HexColor("#F07C63")
CORAL_LIGHT = HexColor("#FBE0D9")
BLUE_LIGHT = HexColor("#E4F0F1")
GREEN_LIGHT = HexColor("#EAF4D5")
MUTED = HexColor("#6C766F")
LINE = HexColor("#DCD8CA")
WHITE = HexColor("#FFFFFF")

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("SaldoSans", str(FONT_DIR / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("SaldoSansBold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("SaldoSerif", str(FONT_DIR / "DejaVuSerif.ttf")))
pdfmetrics.registerFont(TTFont("SaldoSerifBold", str(FONT_DIR / "DejaVuSerif-Bold.ttf")))


def rounded(c, x, y, w, h, radius=12, fill=SURFACE, stroke=LINE, width=1):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def wrap_lines(text, font, size, max_width):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def paragraph(c, text, x, y, width, font="SaldoSans", size=9, color=MUTED, leading=13, max_lines=None):
    lines = wrap_lines(text, font, size, width)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def title(c, text, x, y, size=28, color=INK, width=None, leading=None):
    c.setFillColor(color)
    c.setFont("SaldoSerif", size)
    lines = wrap_lines(text, "SaldoSerif", size, width) if width else [text]
    line_height = leading or size * 1.15
    for line in lines:
        c.drawString(x, y, line)
        y -= line_height
    return y


def eyebrow(c, text, x, y, color=LIME_DARK):
    c.setFillColor(color)
    c.setFont("SaldoSansBold", 7.5)
    c.drawString(x, y, text.upper())


def chip(c, text, x, y, fill=GREEN_LIGHT, color=INK, width=None):
    w = width or pdfmetrics.stringWidth(text, "SaldoSansBold", 7) + 18
    c.setFillColor(fill)
    c.roundRect(x, y, w, 20, 10, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont("SaldoSansBold", 7)
    c.drawCentredString(x + w / 2, y + 7, text.upper())
    return w


def brand(c, x, y, dark=False):
    c.setFillColor(LIME)
    c.roundRect(x, y - 26, 34, 34, 9, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("SaldoSansBold", 9)
    c.drawCentredString(x + 17, y - 15, "SR")
    c.setFillColor(WHITE if dark else INK)
    c.setFont("SaldoSansBold", 12)
    c.drawString(x + 45, y - 16, "Saldo Real")


def footer(c, page_number, dark=False):
    c.setStrokeColor(Color(1, 1, 1, 0.16) if dark else LINE)
    c.line(MARGIN, 36, PAGE_W - MARGIN, 36)
    c.setFont("SaldoSans", 7.2)
    c.setFillColor(Color(1, 1, 1, 0.58) if dark else MUTED)
    c.drawString(MARGIN, 22, "Manual completo do usuário | edição 2.0")
    c.drawRightString(PAGE_W - MARGIN, 22, f"{page_number}/10")


def page_start(c, page_number, section, heading, intro):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    brand(c, MARGIN, PAGE_H - 42)
    eyebrow(c, section, MARGIN, PAGE_H - 108)
    next_y = title(c, heading, MARGIN, PAGE_H - 142, 27, width=PAGE_W - 2 * MARGIN)
    next_y = paragraph(c, intro, MARGIN, next_y - 2, PAGE_W - 2 * MARGIN, size=9.3, leading=14)
    footer(c, page_number)
    return next_y - 10


def bullet(c, text, x, y, width, color=MUTED, bullet_color=LIME_DARK, size=8.5, leading=12):
    c.setFillColor(bullet_color)
    c.circle(x + 3.5, y + 3, 2.5, fill=1, stroke=0)
    return paragraph(c, text, x + 13, y, width - 13, size=size, color=color, leading=leading)


def numbered_step(c, number, heading, body, x, y, w, h, note=None):
    rounded(c, x, y, w, h)
    c.setFillColor(LIME)
    c.circle(x + 25, y + h - 25, 13, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("SaldoSansBold", 9)
    c.drawCentredString(x + 25, y + h - 28, str(number))
    c.setFont("SaldoSansBold", 10.5)
    c.drawString(x + 46, y + h - 22, heading)
    paragraph(c, body, x + 46, y + h - 40, w - 60, size=8, leading=11.5)
    if note:
        c.setFillColor(INK_SOFT)
        c.setFont("SaldoSansBold", 7)
        c.drawString(x + 46, y + 12, note)


def metric_card(c, label, value, body, x, y, w, hero=False):
    fill = INK if hero else SURFACE
    stroke = INK if hero else LINE
    rounded(c, x, y, w, 100, fill=fill, stroke=stroke)
    c.setFillColor(Color(1, 1, 1, 0.65) if hero else MUTED)
    c.setFont("SaldoSansBold", 7.2)
    c.drawString(x + 13, y + 76, label.upper())
    c.setFillColor(LIME if hero else INK)
    c.setFont("SaldoSerif", 18)
    c.drawString(x + 13, y + 48, value)
    paragraph(c, body, x + 13, y + 29, w - 26, size=7.1, color=Color(1, 1, 1, 0.67) if hero else MUTED, leading=10, max_lines=2)


def table(c, headers, rows, x, y, widths, row_height=34, header_height=25, font_size=7.4):
    total_w = sum(widths)
    c.setFillColor(INK)
    c.roundRect(x, y - header_height, total_w, header_height, 8, fill=1, stroke=0)
    cursor = x
    c.setFont("SaldoSansBold", 7)
    c.setFillColor(WHITE)
    for header, width in zip(headers, widths):
        c.drawString(cursor + 8, y - 16, header.upper())
        cursor += width
    current_y = y - header_height
    for index, row in enumerate(rows):
        fill = SURFACE if index % 2 == 0 else HexColor("#F7F4EC")
        c.setFillColor(fill)
        c.setStrokeColor(LINE)
        c.rect(x, current_y - row_height, total_w, row_height, fill=1, stroke=1)
        cursor = x
        for cell, width in zip(row, widths):
            paragraph(c, str(cell), cursor + 8, current_y - 13, width - 14, size=font_size, color=INK_SOFT, leading=9.5, max_lines=2)
            cursor += width
        current_y -= row_height
    return current_y


def cover(c):
    c.setFillColor(INK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setStrokeColor(Color(201 / 255, 241 / 255, 102 / 255, 0.28))
    c.setLineWidth(1)
    c.circle(PAGE_W - 70, PAGE_H - 225, 135, fill=0, stroke=1)
    c.circle(PAGE_W - 70, PAGE_H - 225, 180, fill=0, stroke=1)
    brand(c, 48, PAGE_H - 54, dark=True)
    eyebrow(c, "Manual completo do usuário", 48, PAGE_H - 180, LIME)
    c.setFillColor(WHITE)
    c.setFont("SaldoSerif", 41)
    c.drawString(48, PAGE_H - 222, "Seu dinheiro,")
    c.drawString(48, PAGE_H - 270, "antes do susto.")
    c.setFillColor(LIME)
    c.setFont("SaldoSerif", 28)
    c.drawString(48, PAGE_H - 319, "Do primeiro acesso")
    c.drawString(48, PAGE_H - 354, "ao uso avançado.")
    paragraph(c, "Um guia em camadas para configurar, entender, simular e proteger seus dados no Saldo Real.", 48, PAGE_H - 391, 420, size=11, color=Color(1, 1, 1, 0.72), leading=17)
    rounded(c, 48, 144, PAGE_W - 96, 138, fill=Color(1, 1, 1, 0.06), stroke=Color(1, 1, 1, 0.14))
    c.setFillColor(LIME)
    c.setFont("SaldoSansBold", 8)
    c.drawString(66, 254, "ESCOLHA SUA TRILHA")
    trails = [
        ("COMECE", "Primeiro acesso e exemplo guiado", "páginas 3 a 4"),
        ("ENTENDA", "Cálculos, gráfico e simulações", "páginas 5 a 7"),
        ("DOMINE", "Rotina, segurança e referencia", "páginas 8 a 10"),
    ]
    for index, (label, body, pages) in enumerate(trails):
        yy = 220 - index * 36
        c.setFillColor(LIME)
        c.circle(72, yy + 3, 6, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("SaldoSansBold", 8)
        c.drawString(88, yy + 5, label)
        c.setFont("SaldoSans", 7.8)
        c.setFillColor(Color(1, 1, 1, 0.72))
        c.drawString(153, yy + 5, body)
        c.drawRightString(PAGE_W - 66, yy + 5, pages)
    c.setFont("SaldoSans", 7.5)
    c.setFillColor(Color(1, 1, 1, 0.54))
    c.drawString(48, 108, "Versão do aplicativo: 0.3.2 | Atualizado em agosto de 2026")
    footer(c, 1, dark=True)
    c.showPage()


def reading_map(c):
    y = page_start(c, 2, "Mapa de leitura", "Um manual, três níveis de profundidade", "Leia somente o que precisa agora. Os selos indicam quando o conteúdo é essencial, explicativo ou técnico.")
    trails = [
        ("ESSENCIAL", "Sou iniciante", "Configure o app e obtenha uma primeira projeção confiável.", "3, 4 e 5", GREEN_LIGHT),
        ("ENTENDA MELHOR", "Já organizo minhas contas", "Aprenda como o gráfico, a confiança e os cenários alteram o resultado.", "5, 6, 7 e 8", BLUE_LIGHT),
        ("TÉCNICO", "Quero dominar o produto", "Conheça regras de cálculo, dados, segurança, limites e diagnóstico.", "5, 7, 9 e 10", CORAL_LIGHT),
    ]
    for index, (label, heading, body, pages, fill) in enumerate(trails):
        card_y = y - 86 - index * 92
        rounded(c, MARGIN, card_y, PAGE_W - 2 * MARGIN, 78)
        chip(c, label, MARGIN + 16, card_y + 46, fill=fill)
        c.setFillColor(INK)
        c.setFont("SaldoSerif", 17)
        c.drawString(MARGIN + 16, card_y + 20, heading)
        paragraph(c, body, MARGIN + 190, card_y + 46, 250, size=8.2, color=MUTED, leading=12)
        c.setFillColor(INK_SOFT)
        c.setFont("SaldoSansBold", 7.5)
        c.drawRightString(PAGE_W - MARGIN - 16, card_y + 15, f"Leia as páginas {pages}")
    table_y = 330
    table(c, ["Página", "Assunto", "Resultado"], [
        ("3", "Começo rápido", "Primeira projeção em cerca de 5 minutos"),
        ("4", "Movimentos", "Contas, renda, recorrência e confiança"),
        ("5-6", "Painel", "Métricas, regras e exemplo completo"),
        ("7", "Decisão Segura", "Agora, esperar ou parcelar"),
        ("8", "Planos e rotina", "Transformar simulação em acompanhamento"),
        ("9-10", "Dados e referencia", "Privacidade, backup, limites e ajuda"),
    ], MARGIN, table_y, [52, 155, 304], row_height=30)
    c.showPage()


def quick_start(c):
    y = page_start(c, 3, "Essencial", "Sua primeira projeção em cinco minutos", "Use este roteiro na primeira vez. Você pode experimentar sem conta e decidir depois se quer criar um cadastro.")
    card_w = (PAGE_W - 2 * MARGIN - 12) / 2
    numbered_step(c, 1, "Entre sem cadastro", "Na tela inicial, selecione Experimentar sem conta. O app abre com os dados armazenados neste navegador.", MARGIN, y - 108, card_w, 96, "Não exige e-mail")
    numbered_step(c, 2, "Defina o ponto de partida", "Clique em Ajustar saldo. Informe quanto existe agora e qual valor deve permanecer protegido.", MARGIN + card_w + 12, y - 108, card_w, 96, "Saldo e reserva")
    numbered_step(c, 3, "Cadastre o que vai acontecer", "Adicione renda e contas com datas reais. Marque recorrência quando o movimento se repetir.", MARGIN, y - 216, card_w, 96, "Datas corretas importam")
    numbered_step(c, 4, "Revise o Painel", "Confira saldo seguro, pior ponto, saldo final e próximos movimentos. Corrija dados estranhos antes de decidir.", MARGIN + card_w + 12, y - 216, card_w, 96, "Resultado em 30 dias")
    example_y = y - 252
    eyebrow(c, "Exemplo guiado", MARGIN, example_y)
    title(c, "Maria quer saber quanto pode usar", MARGIN, example_y - 28, 20)
    rows = [
        ("Saldo atual", "R$ 3.000", "Dinheiro disponível hoje"),
        ("Reserva mínima", "R$ 500", "Valor que Maria não quer gastar"),
        ("Aluguel", "- R$ 1.200", "Dia 28, todos os meses"),
        ("Salário", "+ R$ 2.500", "Dia 1, confiança 100%"),
    ]
    table(c, ["Informação", "Valor", "Como cadastrar"], rows, MARGIN, example_y - 58, [130, 104, 277], row_height=34)
    rounded(c, MARGIN, 72, PAGE_W - 2 * MARGIN, 68, fill=INK, stroke=INK)
    c.setFillColor(LIME)
    c.setFont("SaldoSansBold", 8)
    c.drawString(MARGIN + 16, 117, "ANTES DE CONFIAR")
    paragraph(c, "Compare a agenda com seu banco ou suas contas reais. O app calcula somente com os valores que você informou.", MARGIN + 16, 98, PAGE_W - 2 * MARGIN - 32, size=8.3, color=Color(1, 1, 1, 0.74), leading=12)
    c.showPage()


def movements(c):
    y = page_start(c, 4, "Essencial + entenda melhor", "Cadastre movimentos que representem a realidade", "A qualidade da projeção depende de quatro campos: tipo, valor, data e recorrência. A confiança ajusta somente entradas.")
    table(c, ["Campo", "Escolha", "Exemplo", "Efeito no cálculo"], [
        ("Tipo", "Entrada ou saída", "Salário / aluguel", "Entrada soma; saída reduz"),
        ("Data", "Dia real", "28/08/2026", "Define quando o saldo muda"),
        ("Recorrência", "Não, semanal, mensal ou anual", "Aluguel mensal", "Cria ocorrências futuras"),
        ("Confianca", "50%, 80% ou 100%", "Freela 80%", "Reduz somente a entrada prevista"),
    ], MARGIN, y - 6, [88, 122, 141, 160], row_height=44)
    calc_y = y - 232
    eyebrow(c, "Regra da confiança", MARGIN, calc_y)
    title(c, "Planeje entradas com prudencia", MARGIN, calc_y - 28, 20)
    cards = [
        ("100%", "R$ 1.000 viram R$ 1.000", "Use quando a entrada é certa."),
        ("80%", "R$ 1.000 viram R$ 800", "Use quando é provável, mas pode variar."),
        ("50%", "R$ 1.000 viram R$ 500", "Use quando ainda existe incerteza."),
    ]
    card_w = (PAGE_W - 2 * MARGIN - 16) / 3
    for index, (value, formula, body) in enumerate(cards):
        x = MARGIN + index * (card_w + 8)
        rounded(c, x, calc_y - 127, card_w, 84, fill=SURFACE)
        chip(c, value, x + 12, calc_y - 70, fill=[GREEN_LIGHT, BLUE_LIGHT, CORAL_LIGHT][index], width=48)
        c.setFillColor(INK)
        c.setFont("SaldoSansBold", 8.2)
        c.drawString(x + 12, calc_y - 91, formula)
        paragraph(c, body, x + 12, calc_y - 108, card_w - 24, size=7.2, leading=10)
    rounded(c, MARGIN, 132, PAGE_W - 2 * MARGIN, 103, fill=BLUE_LIGHT, stroke=HexColor("#BFD7D8"))
    eyebrow(c, "Campo rápido", MARGIN + 16, 223, color=INK_SOFT)
    c.setFont("SaldoSansBold", 9)
    c.setFillColor(INK)
    c.drawString(MARGIN + 16, 199, "aluguel R$ 1.200 dia 28 todo mês")
    c.drawString(MARGIN + 16, 177, "receber freela R$ 1.000 dia 15")
    paragraph(c, "Depois de usar Interpretar e adicionar, abra Lançamentos e confirme o resultado. Frases ambíguas podem exigir ajuste manual.", MARGIN + 270, 204, 224, size=7.7, color=INK_SOFT, leading=11)
    rounded(c, MARGIN, 56, PAGE_W - 2 * MARGIN, 68, fill=CORAL_LIGHT, stroke=HexColor("#EFB8AD"))
    c.setFillColor(CORAL)
    c.setFont("SaldoSansBold", 8)
    c.drawString(MARGIN + 16, 117, "DESPESAS NAO RECEBEM DESCONTO")
    paragraph(c, "Uma conta de R$ 1.000 entra como R$ 1.000 mesmo se você considerar que talvez consiga adiá-la. Isso evita otimismo excessivo.", MARGIN + 16, 98, PAGE_W - 2 * MARGIN - 32, size=8.1, color=INK_SOFT, leading=12)
    c.showPage()


def dashboard(c):
    y = page_start(c, 5, "Entenda melhor + técnico", "O que cada número do Painel significa", "Os quatro indicadores respondem perguntas diferentes. Nenhum deles, sozinho, representa dinheiro livre para gastar.")
    card_w = (PAGE_W - 2 * MARGIN - 18) / 4
    metrics = [
        ("Saldo seguro", "R$ 1.300", "Menor saldo dos 30 dias menos a reserva.", True),
        ("Saldo atual", "R$ 3.000", "Valor informado como disponível agora.", False),
        ("Em 30 dias", "R$ 4.300", "Saldo no último dia da projeção.", False),
        ("Saúde", "79/100", "Indicador educativo de risco do fluxo.", False),
    ]
    for index, (label, value, body, hero) in enumerate(metrics):
        metric_card(c, label, value, body, MARGIN + index * (card_w + 6), y - 110, card_w, hero)
    formula_y = y - 145
    rounded(c, MARGIN, formula_y - 106, PAGE_W - 2 * MARGIN, 96, fill=INK, stroke=INK)
    eyebrow(c, "Regra central", MARGIN + 16, formula_y - 30, color=LIME)
    c.setFillColor(WHITE)
    c.setFont("SaldoSerif", 18)
    c.drawString(MARGIN + 16, formula_y - 57, "Saldo seguro = pior saldo projetado - reserva mínima")
    paragraph(c, "Se o resultado for negativo, o aplicativo mostra R$ 0,00 como saldo seguro.", MARGIN + 16, formula_y - 80, PAGE_W - 2 * MARGIN - 32, size=8.2, color=Color(1, 1, 1, 0.7), leading=12)
    health_y = formula_y - 142
    eyebrow(c, "Como nasce a saúde do fluxo", MARGIN, health_y)
    title(c, "Uma nota educativa, não uma nota de crédito", MARGIN, health_y - 27, 19)
    table(c, ["Fator", "O que o app observa", "Impacto possível"], [
        ("Projeção", "Saldo negativo ou reserva tocada", "Até -35 ou -18 pontos"),
        ("Dívidas", "Parcelas mínimas em relação à renda", "Até -30 pontos"),
        ("Reserva", "Meses de renda protegidos", "Até -18 pontos"),
        ("Histórico", "Tempo de dados no aplicativo", "Até -8 pontos"),
    ], MARGIN, health_y - 56, [105, 245, 161], row_height=28)
    rounded(c, MARGIN, 52, PAGE_W - 2 * MARGIN, 58, fill=SURFACE)
    paragraph(c, "Faixas atuais: 80 a 100 = fluxo consistente; 60 a 79 = pede atenção; 0 a 59 = fluxo frágil. Metodologia 1.0.0.", MARGIN + 16, 105, PAGE_W - 2 * MARGIN - 32, font="SaldoSansBold", size=7.8, color=INK_SOFT, leading=11)
    c.showPage()


def worked_example(c):
    y = page_start(c, 6, "Entenda melhor", "Exemplo completo: do dado ao resultado", "Acompanhe como o mesmo conjunto de movimentos produz saldo final alto, mas um saldo seguro menor por causa do pior dia.")
    timeline_y = y - 40
    points = [
        (MARGIN + 20, "25 ago", "R$ 3.000", "Inicio"),
        (MARGIN + 150, "28 ago", "R$ 1.800", "Aluguel -1.200"),
        (MARGIN + 300, "01 set", "R$ 4.300", "Salário +2.500"),
        (PAGE_W - MARGIN - 20, "24 set", "R$ 4.300", "Final"),
    ]
    c.setStrokeColor(LIME_DARK)
    c.setLineWidth(3)
    c.line(points[0][0], timeline_y, points[-1][0], timeline_y)
    for x, date, value, event in points:
        c.setFillColor(INK)
        c.circle(x, timeline_y, 7, fill=1, stroke=0)
        c.setFont("SaldoSansBold", 8)
        c.setFillColor(INK)
        c.drawCentredString(x, timeline_y + 18, value)
        c.setFont("SaldoSans", 7)
        c.setFillColor(MUTED)
        c.drawCentredString(x, timeline_y - 18, date)
        c.drawCentredString(x, timeline_y - 31, event)
    c.setStrokeColor(CORAL)
    c.setDash(4, 3)
    reserve_y = timeline_y - 82
    c.line(MARGIN, reserve_y, PAGE_W - MARGIN, reserve_y)
    c.setDash()
    c.setFillColor(CORAL)
    c.setFont("SaldoSansBold", 7)
    c.drawString(MARGIN, reserve_y + 8, "RESERVA R$ 500")
    box_y = reserve_y - 132
    rounded(c, MARGIN, box_y, PAGE_W - 2 * MARGIN, 112, fill=SURFACE)
    eyebrow(c, "Leitura passo a passo", MARGIN + 16, box_y + 87)
    left_x = MARGIN + 16
    y_text = box_y + 64
    y_text = bullet(c, "O menor saldo é R$ 1.800, logo este é o pior ponto.", left_x, y_text, 230, color=INK_SOFT)
    bullet(c, "A reserva definida é R$ 500.", left_x, y_text - 4, 230, color=INK_SOFT)
    right_x = MARGIN + 270
    c.setFillColor(INK)
    c.setFont("SaldoSerif", 19)
    c.drawString(right_x, box_y + 67, "R$ 1.800 - R$ 500")
    c.setFillColor(LIME_DARK)
    c.setFont("SaldoSerifBold", 23)
    c.drawString(right_x, box_y + 35, "= R$ 1.300 seguros")
    status_y = box_y - 26
    eyebrow(c, "O mesmo exemplo em quatro respostas", MARGIN, status_y)
    table(c, ["Pergunta", "Resposta", "Indicador"], [
        ("Quanto existe hoje?", "R$ 3.000", "Saldo atual"),
        ("Quanto sobra no fim?", "R$ 4.300", "Saldo em 30 dias"),
        ("Qual foi o pior ponto?", "R$ 1.800", "Menor saldo projetado"),
        ("Quanto pode ser usado?", "R$ 1.300", "Saldo seguro após reserva"),
    ], MARGIN, status_y - 16, [225, 105, 181], row_height=35)
    rounded(c, MARGIN, 72, PAGE_W - 2 * MARGIN, 52, fill=CORAL_LIGHT, stroke=HexColor("#EFB8AD"))
    paragraph(c, "O saldo final pode parecer confortável e ainda assim existir aperto antes da próxima entrada. Por isso o Saldo Real procura o pior dia.", MARGIN + 14, 101, PAGE_W - 2 * MARGIN - 28, size=8, color=INK_SOFT, leading=11)
    c.showPage()


def decisions(c):
    y = page_start(c, 7, "Entenda melhor + técnico", "Use a Decisão Segura antes de assumir um gasto", "A simulação compara o impacto no fluxo, preserva a mesma reserva e usa as mesmas regras de confiança das entradas.")
    scenario_w = (PAGE_W - 2 * MARGIN - 16) / 3
    scenarios = [
        ("Pagar agora", "R$ 4.500 hoje", "Testa uma saída única na data atual.", CORAL_LIGHT),
        ("Esperar", "R$ 4.500 na data", "Testa a compra na data escolhida e procura uma data segura.", GREEN_LIGHT),
        ("Parcelar", "6 parcelas", "Divide em parcelas mensais, com ajuste de centavos.", BLUE_LIGHT),
    ]
    for index, (heading, value, body, fill) in enumerate(scenarios):
        x = MARGIN + index * (scenario_w + 8)
        rounded(c, x, y - 150, scenario_w, 138, fill=SURFACE)
        chip(c, str(index + 1), x + 12, y - 43, fill=fill, width=28)
        c.setFillColor(INK)
        c.setFont("SaldoSerif", 16)
        c.drawString(x + 12, y - 70, heading)
        c.setFont("SaldoSansBold", 8.5)
        c.drawString(x + 12, y - 91, value)
        paragraph(c, body, x + 12, y - 109, scenario_w - 24, size=7.2, color=MUTED, leading=10)
    explain_y = y - 182
    eyebrow(c, "Como o veredito e escolhido", MARGIN, explain_y)
    flow = [
        ("1", "Cabe agora?", "Sugere pagar agora."),
        ("2", "Cabe na data?", "Sugere esperar."),
        ("3", "Parcelas cabem?", "Sugere parcelar."),
        ("4", "Nada cabe?", "Sugere construir uma meta."),
    ]
    flow_w = (PAGE_W - 2 * MARGIN - 18) / 4
    for index, (number, heading, result) in enumerate(flow):
        x = MARGIN + index * (flow_w + 6)
        rounded(c, x, explain_y - 88, flow_w, 70, fill=INK if index == 3 else SURFACE, stroke=INK if index == 3 else LINE)
        c.setFillColor(LIME)
        c.setFont("SaldoSansBold", 8)
        c.drawString(x + 10, explain_y - 40, number)
        c.setFillColor(WHITE if index == 3 else INK)
        c.setFont("SaldoSansBold", 7.6)
        c.drawString(x + 26, explain_y - 40, heading)
        paragraph(c, result, x + 10, explain_y - 59, flow_w - 20, size=6.8, color=Color(1, 1, 1, 0.7) if index == 3 else MUTED, leading=9)
    table_y = explain_y - 124
    eyebrow(c, "Leia cada cenário", MARGIN, table_y)
    table(c, ["Campo", "Significado", "Pergunta que responde"], [
        ("Seguro / Atenção", "Se toca a reserva ou fica negativo", "Este caminho preserva meu limite?"),
        ("Pior saldo", "Menor valor dentro do horizonte", "Qual é o ponto mais apertado?"),
        ("Data de risco", "Primeiro dia negativo ou abaixo da reserva", "Quando o problema aparece?"),
        ("Meta estimada", "Valor restante dividido pelos meses", "Quanto preciso construir por mês?"),
    ], MARGIN, table_y - 16, [105, 220, 186], row_height=30)
    rounded(c, MARGIN, 60, PAGE_W - 2 * MARGIN, 58, fill=CORAL_LIGHT, stroke=HexColor("#EFB8AD"))
    paragraph(c, "Parcelar protege o fluxo somente se todas as parcelas couberem na projeção. O app não considera juros ou taxas que você não informar no valor total.", MARGIN + 15, 105, PAGE_W - 2 * MARGIN - 30, size=7.8, color=INK_SOFT, leading=11)
    c.showPage()


def plans_and_routine(c):
    y = page_start(c, 8, "Essencial + entenda melhor", "Transforme uma escolha em plano e mantenha o app útil", "O valor do Saldo Real aumenta quando os dados acompanham a vida real. Uma rotina curta evita projeções desatualizadas.")
    rounded(c, MARGIN, y - 122, PAGE_W - 2 * MARGIN, 110, fill=INK, stroke=INK)
    eyebrow(c, "Exemplo de plano", MARGIN + 16, y - 43, color=LIME)
    c.setFillColor(WHITE)
    c.setFont("SaldoSerif", 20)
    c.drawString(MARGIN + 16, y - 71, "Notebook para trabalhar")
    c.setFont("SaldoSansBold", 8)
    c.setFillColor(Color(1, 1, 1, 0.68))
    c.drawString(MARGIN + 16, y - 94, "R$ 1.500 de R$ 5.000 | prazo 15/12/2026")
    c.setFillColor(Color(1, 1, 1, 0.14))
    c.roundRect(MARGIN + 300, y - 80, 190, 10, 5, fill=1, stroke=0)
    c.setFillColor(LIME)
    c.roundRect(MARGIN + 300, y - 80, 57, 10, 5, fill=1, stroke=0)
    c.setFont("SaldoSansBold", 8)
    c.drawString(MARGIN + 300, y - 98, "30% concluido")
    routine_y = y - 157
    eyebrow(c, "Rotina recomendada", MARGIN, routine_y)
    routines = [
        ("Quando algo mudar", "Corrija valor, data ou recorrência assim que souber."),
        ("Uma vez por semana", "Compare próximos movimentos com contas e banco."),
        ("Antes de comprar", "Execute uma nova Decisão Segura."),
        ("Uma vez por mês", "Atualize planos, reserva e faça um backup."),
    ]
    card_w = (PAGE_W - 2 * MARGIN - 12) / 2
    for index, (heading, body) in enumerate(routines):
        col = index % 2
        row = index // 2
        x = MARGIN + col * (card_w + 12)
        yy = routine_y - 94 - row * 100
        numbered_step(c, index + 1, heading, body, x, yy, card_w, 86)
    mistake_y = routine_y - 240
    eyebrow(c, "Erros que mais distorcem a projeção", MARGIN, mistake_y)
    table(c, ["Erro", "Consequência", "Correção"], [
        ("Saldo antigo", "Todos os dias partem do valor errado", "Use Ajustar saldo"),
        ("Conta duplicada", "Despesa aparece duas vezes", "Revise Lançamentos"),
        ("Renda incerta em 100%", "Resultado fica otimista", "Reduza a confiança"),
        ("Recorrencia errada", "Movimento some ou se repete demais", "Ajuste frequência e data"),
    ], MARGIN, mistake_y - 16, [140, 210, 161], row_height=30)
    c.showPage()


def data_and_security(c):
    y = page_start(c, 9, "Técnico + segurança", "Escolha conscientemente onde seus dados ficam", "O Saldo Real oferece dois modos. A escolha muda onde os dados financeiros são armazenados e como podem ser recuperados.")
    table(c, ["Aspecto", "Sem conta", "Com conta"], [
        ("Armazenamento", "Neste navegador", "Banco de dados do Saldo Real"),
        ("E-mail", "Não solicitado", "Necessário para entrar"),
        ("Outro dispositivo", "Não continua automaticamente", "Acesso com login"),
        ("Cópia dos dados", "Backup local em JSON", "Exportação da conta em JSON"),
        ("Risco principal", "Limpar o navegador sem backup", "Perder acesso a senha ou e-mail"),
        ("Migração", "Pode criar conta e levar os dados", "Importação ocorre uma vez em conta vazia"),
    ], MARGIN, y - 2, [108, 201, 202], row_height=36)
    backup_y = y - 260
    eyebrow(c, "Preserve seus dados", MARGIN, backup_y)
    steps = [
        ("Sem conta", "Conta > Baixar backup local"),
        ("Criar conta", "Criar conta e levar meus dados"),
        ("Com conta", "Conta > Baixar meus dados"),
    ]
    step_w = (PAGE_W - 2 * MARGIN - 16) / 3
    for index, (heading, body) in enumerate(steps):
        x = MARGIN + index * (step_w + 8)
        rounded(c, x, backup_y - 84, step_w, 68, fill=[GREEN_LIGHT, BLUE_LIGHT, SURFACE][index])
        c.setFillColor(INK)
        c.setFont("SaldoSansBold", 8.2)
        c.drawString(x + 12, backup_y - 39, heading)
        paragraph(c, body, x + 12, backup_y - 57, step_w - 24, size=7, color=MUTED, leading=9)
    rounded(c, MARGIN, 120, PAGE_W - 2 * MARGIN, 126, fill=INK, stroke=INK)
    eyebrow(c, "Privacidade em linguagem direta", MARGIN + 16, 218, color=LIME)
    bullets = [
        "O aplicativo não conecta ao banco e não movimenta dinheiro.",
        "Dados públicos de contexto econômico não alteram automaticamente o saldo seguro.",
        "O backup e a exportação são cópias em JSON; guarde em local protegido.",
        "Excluir a conta é uma ação definitiva e remove os dados associados.",
    ]
    yy = 196
    for item in bullets:
        yy = bullet(c, item, MARGIN + 16, yy, PAGE_W - 2 * MARGIN - 32, color=Color(1, 1, 1, 0.73), bullet_color=LIME, size=7.7, leading=11) - 4
    rounded(c, MARGIN, 72, PAGE_W - 2 * MARGIN, 34, fill=CORAL_LIGHT, stroke=HexColor("#EFB8AD"))
    paragraph(c, "Nunca envie backup, senha ou dados financeiros em grupos, comentários ou redes sociais.", MARGIN + 14, 92, PAGE_W - 2 * MARGIN - 28, font="SaldoSansBold", size=7.6, color=INK_SOFT, leading=10)
    c.showPage()


def reference(c):
    y = page_start(c, 10, "Referencia rapida", "Resolva problemas e saiba os limites do produto", "Use esta pagina quando algum resultado parecer estranho ou quando precisar explicar o Saldo Real para outra pessoa.")
    left_w = 248
    right_x = MARGIN + left_w + 15
    right_w = PAGE_W - MARGIN - right_x
    rounded(c, MARGIN, y - 270, left_w, 258, fill=SURFACE)
    eyebrow(c, "Diagnóstico", MARGIN + 14, y - 38)
    issues = [
        ("O saldo parece errado", "Revise saldo atual, duplicatas e datas."),
        ("Uma conta não aparece", "Confira data, recorrência e horizonte."),
        ("A renda entrou menor", "Verifique a confiança de 50%, 80% ou 100%."),
        ("O gráfico tocou a reserva", "Abra a agenda e identifique o primeiro dia de risco."),
        ("Perdi dados sem conta", "Restaure o backup. Sem arquivo, não há recuperação."),
    ]
    yy = y - 68
    for heading, body in issues:
        c.setFillColor(INK)
        c.setFont("SaldoSansBold", 7.7)
        c.drawString(MARGIN + 14, yy, heading)
        yy = paragraph(c, body, MARGIN + 14, yy - 14, left_w - 28, size=7, color=MUTED, leading=9.5) - 10
    rounded(c, right_x, y - 270, right_w, 258, fill=BLUE_LIGHT, stroke=HexColor("#BFD7D8"))
    eyebrow(c, "Limites", right_x + 14, y - 38, color=INK_SOFT)
    limits = [
        "Não consulta seu saldo bancário.",
        "Não garante que uma renda acontecerá.",
        "Não inclui juros ou taxas não informados.",
        "Não substitui orientação financeira profissional.",
        "Não recomenda investimentos ou crédito.",
        "A projeção depende integralmente dos dados inseridos.",
    ]
    yy = y - 70
    for item in limits:
        yy = bullet(c, item, right_x + 14, yy, right_w - 28, color=INK_SOFT, bullet_color=LIME_DARK, size=7.6, leading=10.5) - 8
    glossary_y = y - 305
    eyebrow(c, "Glossario", MARGIN, glossary_y)
    table(c, ["Termo", "Definicao direta"], [
        ("Saldo seguro", "Valor livre depois do pior ponto e da reserva."),
        ("Pior saldo", "Menor saldo encontrado no período projetado."),
        ("Reserva mínima", "Valor que deve permanecer protegido."),
        ("Confianca", "Percentual aplicado somente a uma entrada."),
        ("Horizonte", "Quantidade de dias observados pelo cálculo."),
    ], MARGIN, glossary_y - 16, [135, 376], row_height=26)
    rounded(c, MARGIN, 52, PAGE_W - 2 * MARGIN, 65, fill=INK, stroke=INK)
    c.setFillColor(LIME)
    c.setFont("SaldoSansBold", 8)
    c.drawString(MARGIN + 15, 96, "CHECKLIST FINAL")
    paragraph(c, "Saldo atualizado | Contas revisadas | Rendas com confiança realista | Reserva definida | Backup recente", MARGIN + 15, 76, PAGE_W - 2 * MARGIN - 30, size=7.8, color=Color(1, 1, 1, 0.75), leading=11)
    c.showPage()


def generate():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    document.setTitle("Manual completo do usuário - Saldo Real")
    document.setAuthor("Henrique Sembla")
    document.setSubject("Guia completo do Saldo Real para usuários iniciantes e avançados")
    document.setKeywords("Saldo Real, manual, planejamento financeiro, saldo seguro, projeção")
    cover(document)
    reading_map(document)
    quick_start(document)
    movements(document)
    dashboard(document)
    worked_example(document)
    decisions(document)
    plans_and_routine(document)
    data_and_security(document)
    reference(document)
    document.save()
    print(f"Manual gerado em {OUTPUT}")


if __name__ == "__main__":
    generate()
