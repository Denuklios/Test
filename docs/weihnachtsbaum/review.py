# shared: Google review QR box
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

REVIEW_URL = "https://www.google.com/search?q=rezensionen+f%C3%BCr+sonderpreis+baumarkt+wees"

def review_box(c, x, y_top, w, h, RED, DRED, GOLD, INK, GREY, white, rrect, star_path, poly):
    rrect(x, y_top - h, w, h, 12, fill=white, stroke=GOLD, lw=1.4)
    q = h - 16
    qr = QrCodeWidget(REVIEW_URL); qr.barLevel = "M"
    b = qr.getBounds(); bw, bh = b[2] - b[0], b[3] - b[1]
    d = Drawing(q, q, transform=[q / bw, 0, 0, q / bh, 0, 0]); d.add(qr)
    renderPDF.draw(d, c, x + w - q - 8, y_top - h + 8)
    tx = x + 16
    for i in range(5):
        poly(star_path(tx + 8 + i * 19, y_top - 18, 8, 3.4), fill=GOLD)
    c.setFillColor(RED); c.setFont("B", 15); c.drawString(tx, y_top - 44, "Hat's dir gefallen? Bewerte uns auf Google!")
    c.setFillColor(INK); c.setFont("R", 10.5)
    c.drawString(tx, y_top - 60, "QR-Code mit dem Handy scannen und deine Bewertung abgeben.")
    c.setFillColor(GREY); c.setFont("R", 9.5)
    c.drawString(tx, y_top - h + 12, "Sonderpreis Baumarkt Wees · Birkenbogen 2 · 24999 Wees")
