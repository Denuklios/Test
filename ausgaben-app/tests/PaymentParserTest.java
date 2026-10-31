import de.anderssohn.ausgaben.zahlungen.PaymentParser;
/** Test der Zahlungserkennung. Aufruf (im Ordner ausgaben-app):
 *  javac -d /tmp/pt zahlungen/src/main/java/de/anderssohn/ausgaben/zahlungen/PaymentParser.java tests/PaymentParserTest.java && java -cp /tmp/pt PaymentParserTest */
public class PaymentParserTest {
  static int fails = 0;
  static void t(String pkg, String title, String text, Double amt, String mer) {
    PaymentParser.Result r = PaymentParser.parse(pkg, title, text);
    String got = r == null ? "null" : r.amount + " | " + r.merchant;
    String exp = amt == null ? "null" : amt + " | " + mer;
    boolean ok = got.equals(exp); if (!ok) fails++;
    System.out.println((ok ? "ok   " : "FAIL ") + title + " / " + text + "  ->  " + got + (ok ? "" : "   (erwartet " + exp + ")"));
  }
  public static void main(String[] a) {
    String GW = "com.google.android.apps.walletnfcrel";
    t(GW, "REWE", "23,45 €", 23.45, "REWE");
    t(GW, "REWE Markt GmbH", "23,45 € mit Visa •• 1234", 23.45, "REWE Markt GmbH");
    t(GW, "Google Wallet", "Bezahlt: 12,99 € bei ALDI SÜD", 12.99, "ALDI SÜD");
    t(GW, "€4.50", "Starbucks", 4.5, "Starbucks");
    t("com.samsung.android.spay", "Zahlung erfolgreich", "8,20 € bei Bäckerei Schmidt", 8.2, "Bäckerei Schmidt");
    t("de.number26.android", "Kartenzahlung", "Du hast 15,40 € bei Lidl bezahlt.", 15.4, "Lidl");
    t("de.dkb.portalapp", "Neuer Umsatz", "Kartenzahlung -61,30 EUR ARAL Tankstelle", 61.3, "ARAL Tankstelle");
    t("com.starfinanz.smob.android.sfinanzstatus", "Umsatz", "Ihr Konto wurde mit 49,99 EUR belastet: Amazon", 49.99, "Amazon");
    t("de.number26.android", "Gutschrift", "Du hast 2.450,00 € erhalten", null, null);
    t("de.ingdiba.bankingapp", "Kontostand", "Ihr Kontostand: 1.234,56 €", null, null);
    t("com.whatsapp", "REWE", "23,45 €", null, null);
    t("com.lunarway.app", "Betaling", "Du har betalt 129,95 kr hos Føtex", 129.95, "Føtex");
    t("com.paypal.android.p2pmobile", "Zahlung gesendet", "Sie haben 19,90 € an Zalando gesendet", 19.9, "Zalando");
    System.out.println(fails == 0 ? "ALLE OK" : fails + " Fehler");
  }
}
