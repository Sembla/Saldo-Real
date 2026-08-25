from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, Color

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "manual-saldo-real.pdf"

PAGE_W, PAGE_H = A4
INK = HexColor("#10231D")
INK_SOFT = HexColor("#29443A")
PAPER = HexColor("#F4F1E8")
SURFACE = HexColor("#FFFDF7")
LIME = HexColor("#C9F166")
LIME_DARK = HexColor("#93BB35")
CORAL = HexColor("#F07C63")
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
    lines, line = [], ""
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


def paragraph(c, text, x, y, width, font="SaldoSans", size=10, color=MUTED, leading=15, max_lines=None):
    lines = wrap_lines(text, font, size, width)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def eyebrow(c, text, x, y, color=LIME_DARK):
    c.setFillColor(color)
    c.setFont("SaldoSansBold", 8)
    c.drawString(x, y, text.upper())


def title(c, text, x, y, size=28, color=INK, width=None):
    c.setFillColor(color)
    c.setFont("SaldoSerif", size)
    if width:
        for line in wrap_lines(text, "SaldoSerif", size, width):
            c.drawString(x, y, line)
            y -= size * 1.15
        return y
    c.drawString(x, y, text)
    return y - size * 1.15


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
    c.setStrokeColor(Color(1, 1, 1, .16) if dark else LINE)
    c.line(42, 36, PAGE_W - 42, 36)
    c.setFont("SaldoSans", 7.5)
    c.setFillColor(Color(1, 1, 1, .55) if dark else MUTED)
    c.drawString(42, 22, "Manual do usuário · edição 1.0")
    c.drawRightString(PAGE_W - 42, 22, f"{page_number}/4")


def step_card(c, number, heading, body, x, y, w, h):
    rounded(c, x, y, w, h)
    c.setFillColor(LIME)
    c.circle(x + 28, y + h - 29, 14, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("SaldoSansBold", 10)
    c.drawCentredString(x + 28, y + h - 33, str(number))
    c.setFont("SaldoSansBold", 11)
    c.drawString(x + 51, y + h - 25, heading)
    paragraph(c, body, x + 51, y + h - 43, w - 69, size=8.4, leading=12)


def metric(c, label, value, x, y, w, hero=False):
    fill = INK if hero else SURFACE
    stroke = INK if hero else LINE
    rounded(c, x, y, w, 72, fill=fill, stroke=stroke)
    c.setFillColor(Color(1, 1, 1, .65) if hero else MUTED)
    c.setFont("SaldoSansBold", 7.5)
    c.drawString(x + 12, y + 51, label)
    c.setFillColor(LIME if hero else INK)
    c.setFont("SaldoSerif", 18)
    c.drawString(x + 12, y + 23, value)


def cover(c):
    c.setFillColor(INK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setStrokeColor(Color(201/255, 241/255, 102/255, .28))
    c.setLineWidth(1)
    c.circle(PAGE_W - 55, PAGE_H - 210, 145, fill=0, stroke=1)
    c.circle(PAGE_W - 55, PAGE_H - 210, 190, fill=0, stroke=1)
    brand(c, 48, PAGE_H - 54, dark=True)
    eyebrow(c, "Manual rápido de uso", 48, PAGE_H - 190, LIME)
    c.setFillColor(WHITE)
    c.setFont("SaldoSerif", 43)
    c.drawString(48, PAGE_H - 226, "Seu dinheiro,")
    c.drawString(48, PAGE_H - 276, "antes do susto.")
    c.setFillColor(LIME)
    c.setFont("SaldoSerif", 43)
    c.drawString(48, PAGE_H - 326, "começa aqui.")
    paragraph(
        c,
        "Aprenda a projetar seu caixa, testar decisões e criar planos em poucos minutos - com ou sem cadastro.",
        48, PAGE_H - 372, 395, size=12, color=Color(1, 1, 1, .72), leading=18,
    )
    rounded(c, 48, 135, PAGE_W - 96, 118, fill=Color(1, 1, 1, .06), stroke=Color(1, 1, 1, .14))
    c.setFillColor(LIME)
    c.setFont("SaldoSansBold", 8)
    c.drawString(66, 227, "EM QUATRO PASSOS")
    items = [
        ("1", "Ajuste o saldo"),
        ("2", "Informe contas e renda"),
        ("3", "Leia a projeção"),
        ("4", "Simule antes de decidir"),
    ]
    col_w = (PAGE_W - 132) / 2
    for index, (number, text) in enumerate(items):
        col = index % 2
        row = index // 2
        x = 66 + col * col_w
        yy = 195 - row * 38
        c.setFillColor(LIME)
        c.circle(x + 8, yy + 4, 9, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("SaldoSansBold", 7)
        c.drawCentredString(x + 8, yy + 1.5, number)
        c.setFillColor(WHITE)
        c.setFont("SaldoSans", 9)
        c.drawString(x + 25, yy, text)
    footer(c, 1, dark=True)
    c.showPage()


def getting_started(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    brand(c, 42, PAGE_H - 44)
    eyebrow(c, "Primeiros minutos", 42, PAGE_H - 112)
    title(c, "Comece sem conta", 42, PAGE_H - 146, 30)
    paragraph(
        c,
        "Na tela inicial, escolha Experimentar sem conta. Nenhum e-mail é exigido e os dados financeiros permanecem neste navegador.",
        42, PAGE_H - 186, PAGE_W - 84, size=10, leading=15,
    )
    step_card(c, 1, "Ajuste o ponto de partida", "No Painel, clique em Ajustar saldo. Informe o dinheiro disponível agora e a reserva mínima que não deve ser gasta.", 42, 485, PAGE_W - 84, 88)
    step_card(c, 2, "Adicione contas e renda", "Use + Conta ou renda para preencher os campos ou escreva: aluguel R$ 1.200 dia 10 todo mês. Entradas incertas podem receber confiança de 50%, 80% ou 100%.", 42, 382, PAGE_W - 84, 88)
    step_card(c, 3, "Confira os próximos movimentos", "Lançamentos únicos e recorrentes aparecem na agenda. Verifique datas, valores e categorias antes de confiar na projeção.", 42, 279, PAGE_W - 84, 88)
    step_card(c, 4, "Faça um backup", "No menu Conta, use Baixar backup local. Se os dados do navegador forem apagados antes do backup ou cadastro, não poderão ser recuperados.", 42, 176, PAGE_W - 84, 88)
    rounded(c, 42, 76, PAGE_W - 84, 72, fill=HexColor("#FFF5F1"), stroke=HexColor("#EFB8AD"))
    c.setFillColor(CORAL)
    c.setFont("SaldoSansBold", 9)
    c.drawString(58, 124, "ATENÇÃO")
    paragraph(c, "O modo sem conta é privado, mas depende deste dispositivo e deste perfil do navegador. Faça backup regularmente.", 58, 105, PAGE_W - 116, size=8.7, color=INK_SOFT, leading=13)
    footer(c, 2)
    c.showPage()


def dashboard_and_decision(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    brand(c, 42, PAGE_H - 44)
    eyebrow(c, "Leitura do produto", 42, PAGE_H - 112)
    title(c, "Entenda o Painel", 42, PAGE_H - 146, 30)
    paragraph(c, "O Saldo Real não mostra apenas o saldo de hoje. Ele procura o pior ponto dos próximos 30 dias e protege a reserva definida por você.", 42, PAGE_H - 186, PAGE_W - 84, size=10, leading=15)
    gap = 8
    card_w = (PAGE_W - 84 - gap * 3) / 4
    metric(c, "SALDO SEGURO", "R$ 1.300", 42, 527, card_w, True)
    metric(c, "SALDO ATUAL", "R$ 3.000", 42 + (card_w + gap), 527, card_w)
    metric(c, "EM 30 DIAS", "R$ 4.300", 42 + (card_w + gap) * 2, 527, card_w)
    metric(c, "SAÚDE", "79/100", 42 + (card_w + gap) * 3, 527, card_w)
    rounded(c, 42, 410, PAGE_W - 84, 92, fill=SURFACE)
    eyebrow(c, "Como interpretar", 57, 480)
    paragraph(c, "Saldo seguro é o valor que sobra depois de considerar as contas futuras e preservar a reserva. Em 30 dias é o saldo final previsto. Saúde do fluxo é um indicador educativo, não uma análise de crédito.", 57, 458, PAGE_W - 114, size=8.8, color=INK_SOFT, leading=13)
    eyebrow(c, "Decisão Segura", 42, 375)
    title(c, "Antes de comprar, compare caminhos", 42, 346, 23)
    paragraph(c, "Abra Decidir, informe o que deseja comprar, o valor, a data e o parcelamento que quer comparar.", 42, 315, PAGE_W - 84, size=9, leading=14)
    scenario_w = (PAGE_W - 84 - 16) / 3
    scenarios = [
        ("PAGAR AGORA", "Mostra se a compra toca a reserva hoje.", HexColor("#F9D8D1")),
        ("ESPERAR", "Procura uma data mais segura dentro de 12 meses.", HexColor("#E8F2D5")),
        ("PARCELAR", "Testa o efeito de cada parcela no fluxo futuro.", HexColor("#E6F0F2")),
    ]
    for index, (heading, body, accent) in enumerate(scenarios):
        x = 42 + index * (scenario_w + 8)
        rounded(c, x, 190, scenario_w, 102, fill=SURFACE)
        c.setFillColor(accent)
        c.roundRect(x + 12, 263, scenario_w - 24, 19, 8, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("SaldoSansBold", 7.5)
        c.drawCentredString(x + scenario_w / 2, 269, heading)
        paragraph(c, body, x + 13, 242, scenario_w - 26, size=8.1, color=MUTED, leading=12)
    rounded(c, 42, 78, PAGE_W - 84, 82, fill=INK, stroke=INK)
    c.setFillColor(LIME)
    c.setFont("SaldoSansBold", 9)
    c.drawString(58, 134, "REGRA DE OURO")
    paragraph(c, "Confira se as contas e rendas estão corretas. Uma projeção só pode ser confiável quando os dados informados representam a realidade.", 58, 114, PAGE_W - 116, size=8.8, color=Color(1, 1, 1, .76), leading=13)
    footer(c, 3)
    c.showPage()


def plans_and_account(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    brand(c, 42, PAGE_H - 44)
    eyebrow(c, "Progresso e segurança", 42, PAGE_H - 112)
    title(c, "Transforme decisões em planos", 42, PAGE_H - 146, 29)
    paragraph(c, "Depois de uma simulação, use Transformar em plano. O objetivo aparecerá em Planos com valor-alvo, data desejada e progresso.", 42, PAGE_H - 186, PAGE_W - 84, size=10, leading=15)
    rounded(c, 42, 505, PAGE_W - 84, 92, fill=INK, stroke=INK)
    c.setFillColor(LIME)
    c.setFont("SaldoSansBold", 8)
    c.drawString(58, 569, "PLANO · NOTEBOOK PARA TRABALHAR")
    c.setFillColor(WHITE)
    c.setFont("SaldoSerif", 23)
    c.drawString(58, 535, "R$ 1.500 de R$ 5.000")
    c.setFillColor(Color(1, 1, 1, .16))
    c.roundRect(340, 541, 185, 8, 4, fill=1, stroke=0)
    c.setFillColor(LIME)
    c.roundRect(340, 541, 56, 8, 4, fill=1, stroke=0)
    c.setFont("SaldoSansBold", 8)
    c.drawRightString(525, 563, "30%")

    eyebrow(c, "Onde os dados ficam", 42, 467)
    col_w = (PAGE_W - 92) / 2
    rounded(c, 42, 318, col_w, 130, fill=SURFACE)
    rounded(c, 50 + col_w, 318, col_w, 130, fill=SURFACE)
    c.setFillColor(INK)
    c.setFont("SaldoSansBold", 11)
    c.drawString(58, 421, "Sem conta")
    c.drawString(66 + col_w, 421, "Com conta")
    paragraph(c, "Dados somente neste navegador. Não exige e-mail. Ideal para testar. Requer backup manual.", 58, 397, col_w - 32, size=8.5, leading=13)
    paragraph(c, "Dados associados à conta. Permite continuar em outro dispositivo. Exige e-mail e senha.", 66 + col_w, 397, col_w - 32, size=8.5, leading=13)
    c.setFillColor(LIME_DARK)
    c.setFont("SaldoSansBold", 8)
    c.drawString(58, 338, "PRIVACIDADE LOCAL")
    c.drawString(66 + col_w, 338, "BACKUP E SINCRONIZAÇÃO")

    eyebrow(c, "Checklist rápido", 42, 282)
    checklist = [
        "Atualize o saldo quando o valor real mudar.",
        "Revise lançamentos recorrentes e datas.",
        "Mantenha uma reserva mínima realista.",
        "Use Decidir antes de uma compra importante.",
        "Baixe o backup ou crie uma conta para preservar o progresso.",
    ]
    y = 253
    for item in checklist:
        c.setFillColor(LIME)
        c.circle(49, y + 2, 5, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("SaldoSansBold", 7)
        c.drawCentredString(49, y, "✓")
        c.setFillColor(INK_SOFT)
        c.setFont("SaldoSans", 8.7)
        c.drawString(62, y - 1, item)
        y -= 27

    rounded(c, 42, 62, PAGE_W - 84, 56, fill=HexColor("#EEF5DE"), stroke=HexColor("#C8DC9E"))
    c.setFillColor(INK)
    c.setFont("SaldoSansBold", 8.5)
    c.drawString(58, 96, "Precisa de ajuda?")
    paragraph(c, "Volte à seção Ajuda do aplicativo. O Saldo Real é educativo e não movimenta dinheiro nem recomenda investimentos.", 58, 80, PAGE_W - 116, size=7.8, color=INK_SOFT, leading=11)
    footer(c, 4)
    c.showPage()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Manual do usuário - Saldo Real")
    c.setAuthor("Henrique Sembla")
    c.setSubject("Guia rápido para usar o Saldo Real com ou sem conta")
    cover(c)
    getting_started(c)
    dashboard_and_decision(c)
    plans_and_account(c)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
