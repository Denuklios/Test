package de.anderssohn.ausgaben.zahlungen;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Erkennt Zahlungen in Benachrichtigungen von Wallet- und Banking-Apps (ohne Android-Abhängigkeiten, testbar). */
public final class PaymentParser {

    /** Wallet-Apps: jede Benachrichtigung mit Betrag ist eine Zahlung. */
    static final Set<String> WALLETS = new HashSet<>(Arrays.asList(
            "com.google.android.apps.walletnfcrel",      // Google Wallet
            "com.google.android.apps.nbu.paisa.user",
            "com.samsung.android.spay",                  // Samsung Wallet
            "com.samsung.android.samsungpay.gear",
            "com.paypal.android.p2pmobile",              // PayPal
            "com.imaginecurve.curve.prd",                // Curve
            "dk.danskebank.mobilepay",                   // MobilePay
            "com.mobilepay.consumer"));

    /** Banking-Apps: nur mit typischem Zahlungswort. */
    static final Set<String> BANKS = new HashSet<>(Arrays.asList(
            "de.number26.android", "com.starfinanz.smob.android.sfinanzstatus", "com.starfinanz.smob.android.sbanking",
            "de.dkb.portalapp", "de.ingdiba.bankingapp", "de.comdirect.android", "com.c24.bankapp",
            "de.fiducia.smartphone.android.banking.vr", "com.revolut.revolut", "de.consorsbank",
            "de.postbank.finanzassistent", "com.db.pwcc.dbmobile", "de.commerzbanking.mobil",
            "de.traderepublic.app", "money.vivid.android", "de.santander.presentation", "com.bunq.android",
            "com.danskebank.mobilebank3.dk", "com.lunarway.app", "dk.nordea.mobilebank", "dk.jyskebank.mobilbank",
            "com.nordea.mobilebank", "de.tomorrow.android", "com.wise.android", "com.transferwise.android",
            "eu.netinsight.payback", "de.hypovereinsbank.banking", "de.targobank.mobile"));

    private static final Pattern AMOUNT = Pattern.compile(
            "(?:(€|EUR|DKK|kr\\.?)\\s?)?(-?\\d{1,3}(?:[.\\s']\\d{3})*|-?\\d+)([.,])(\\d{2})(?!\\d)\\s?(€|EUR|DKK|kr\\.?)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PAY_WORDS = Pattern.compile(
            "(bezahlt|zahlung|kartenzahlung|kartenumsatz|belastet|belastung|abbuchung|abgebucht|ausgegeben|umsatz|lastschrift|"
            + "kauf|einkauf|payment|paid|purchase|spent|betalt|betaling|køb|kortbetaling|transaktion|transaction|apple pay|google pay)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INCOME_WORDS = Pattern.compile(
            "(gutschrift|eingang|eingegangen|erhalten|empfangen|received|gehalt|lohn|rückerstattung|erstattung|refund|modtaget|indbetaling|"
            + "angebot|rabatt|gutschein|werbung|newsletter|kontostand|saldo|limit|zinsen)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern MERCHANT_AFTER = Pattern.compile(
            "(?:\\bbei|\\ban|\\bat|\\bhos|\\bto|\\bfür|\\bim)\\s+([A-Za-zÄÖÜäöüßÆØÅæøå0-9&'\\-. ]{2,40}?)(?=\\s*(?:[,.:;!(]|\\bmit\\b|\\bwith\\b|\\bvon\\b|\\bam\\b|\\bbezahlt\\b|\\bgesendet\\b|\\bgezahlt\\b|\\bbetalt\\b|\\bpaid\\b|\\bsent\\b|\\d|€|$))",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern GENERIC = Pattern.compile(
            "^(google wallet|google pay|samsung wallet|samsung pay|paypal|curve|mobilepay|zahlung|zahlung erfolgreich|kartenzahlung|"
            + "bezahlt|neue zahlung|neuer umsatz|umsatz|payment|transaktion|n26|dkb|ing|sparkasse|revolut|lunar|wallet|.*bank.*)$",
            Pattern.CASE_INSENSITIVE);

    public static final class Result {
        public final double amount; public final String merchant;
        Result(double a, String m) { amount = a; merchant = m; }
    }

    private PaymentParser() { }

    public static boolean watched(String pkg) { return WALLETS.contains(pkg) || BANKS.contains(pkg); }

    /** Liefert die erkannte Zahlung oder null. */
    public static Result parse(String pkg, String title, String text) {
        if (!watched(pkg)) return null;
        title = title == null ? "" : title.trim();
        text = text == null ? "" : text.trim();
        String all = (title + " · " + text).replace(' ', ' ');
        if (INCOME_WORDS.matcher(all).find()) return null;
        boolean wallet = WALLETS.contains(pkg);
        if (!wallet && !PAY_WORDS.matcher(all).find()) return null;

        Matcher m = AMOUNT.matcher(all);
        Double amount = null;
        while (m.find()) {
            boolean cur = m.group(1) != null || m.group(5) != null;
            String intPart = m.group(2).replaceAll("[.\\s']", "");
            double v = Math.abs(Double.parseDouble(intPart + "." + m.group(4)));
            if (v <= 0 || v > 10000) continue;
            if (cur || wallet) { amount = v; if (cur) break; }
        }
        if (amount == null) return null;

        String merchant = null;
        if (!title.isEmpty() && !AMOUNT.matcher(title).find() && !GENERIC.matcher(title).matches() && !PAY_WORDS.matcher(title).find()) merchant = title;
        if (merchant == null) {
            Matcher mm = MERCHANT_AFTER.matcher(all);
            while (mm.find()) {
                String c = mm.group(1).trim();
                if (c.length() >= 2 && !c.matches("(?i)(visa|mastercard|karte|card|debitkarte|kreditkarte|girocard|dein.*|ihr.*|deine.*|ihre.*)")) { merchant = c; break; }
            }
        }
        if (merchant == null) {
            String body = text.contains(":") ? text.substring(text.lastIndexOf(':') + 1) : text;
            for (String part : body.split("[·•|\\n]")) {
                String p = AMOUNT.matcher(part).replaceAll(" ");
                p = PAY_WORDS.matcher(p).replaceAll(" ");
                p = p.replaceAll("(?i)\\b(du hast|sie haben|ihr konto wurde|dein konto wurde|du har|mit|visa|mastercard|karte|erfolgreich|neue[rs]?)\\b|\\*+\\d+|••+\\s?\\d+|^\\s*-", " ")
                     .replaceAll("\\s{2,}", " ").trim();
                if (p.length() >= 2 && p.matches(".*[A-Za-zÄÖÜäöüæøå]{2}.*") && !GENERIC.matcher(p).matches()) { merchant = p; break; }
            }
        }
        if (merchant != null) merchant = merchant.replaceAll("\\s{2,}", " ").replaceAll("[\\s,.:;-]+$", "");
        return new Result(Math.round(amount * 100) / 100.0, merchant == null ? "" : merchant);
    }

    static String lower(String s) { return s.toLowerCase(Locale.GERMANY); }
}
