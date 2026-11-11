package app.mailwerk.mail

import app.mailwerk.tr

import app.mailwerk.data.Category

/** Wo eine Regel sucht. */
enum class RuleField(val label: String) {
    FROM(tr("Absender")), TO(tr("Empfänger (An/Cc)")), SUBJECT(tr("Betreff")), BODY(tr("Text")), ANY(tr("Absender, Empfänger oder Betreff")), ALL(tr("Jede Mail"));
    companion object { fun of(s: String?) = entries.firstOrNull { it.name == s } ?: FROM }
}

enum class RuleOp(val label: String) {
    CONTAINS(tr("enthält")), NOT_CONTAINS(tr("enthält nicht")), EQUALS(tr("ist genau")), STARTS(tr("beginnt mit")), ENDS(tr("endet mit"));
    companion object { fun of(s: String?) = entries.firstOrNull { it.name == s } ?: CONTAINS }
}

enum class RuleAction(val label: String, val needsArg: Boolean) {
    MOVE(tr("In Ordner verschieben"), true),
    CATEGORY(tr("Einsortieren als"), true),
    READ(tr("Als gelesen markieren"), false),
    FLAG(tr("Markieren (Fähnchen)"), false),
    PIN(tr("Anheften"), false),
    FORWARD(tr("Weiterleiten an"), true),
    SPAM(tr("In den Spam-Ordner"), false),
    DELETE(tr("Löschen (Papierkorb)"), false);
    companion object { fun of(s: String?) = entries.firstOrNull { it.name == s } ?: MOVE }
}

data class Rule(
    val id: Long = 0,
    val name: String,
    val enabled: Boolean = true,
    /** null = gilt für alle Konten */
    val accountId: Long? = null,
    val field: RuleField = RuleField.FROM,
    val op: RuleOp = RuleOp.CONTAINS,
    val value: String = "",
    val action: RuleAction = RuleAction.MOVE,
    /** Ordnername / Kategorie-Name / Weiterleitungsadresse(n) */
    val arg: String = "",
    /** danach keine weiteren Regeln prüfen */
    val stop: Boolean = false,
) {
    fun describe(): String {
        val cond = if (field == RuleField.ALL) tr("Jede Mail") else "${field.label} ${op.label} „$value“"
        val act = when (action) {
            RuleAction.CATEGORY -> "${action.label} ${Category.of(arg).label}"
            RuleAction.MOVE, RuleAction.FORWARD -> "${action.label} $arg"
            else -> action.label
        }
        return "$cond → $act"
    }
}

/** Sperrliste: einzelne Adresse oder ganze Domain. */
data class BlockEntry(val pattern: String, val isDomain: Boolean) {
    fun matches(from: String): Boolean {
        val f = from.lowercase().trim()
        val p = pattern.lowercase().trim().removePrefix("@")
        return if (isDomain) f.substringAfter('@') == p || f.substringAfter('@').endsWith(".$p") else f == p
    }
}

data class Incoming(
    val from: String,
    val fromName: String,
    val to: String,
    val cc: String,
    val subject: String,
    val body: String,
    val headers: Map<String, String> = emptyMap(),
)

data class Decision(
    val spam: Boolean = false,
    val delete: Boolean = false,
    val moveTo: String? = null,
    val read: Boolean = false,
    val flag: Boolean = false,
    val pin: Boolean = false,
    val category: Category? = null,
    val forwardTo: List<String> = emptyList(),
    val blocked: Boolean = false,
    val matched: List<String> = emptyList(),
) {
    /** Mail bleibt nicht im Posteingang */
    val leavesInbox get() = spam || delete || moveTo != null
}

object RuleEngine {
    private fun hay(r: Rule, m: Incoming): List<String> = when (r.field) {
        RuleField.FROM -> listOf(m.from, m.fromName, "${m.fromName} <${m.from}>")
        RuleField.TO -> listOf(m.to, m.cc)
        RuleField.SUBJECT -> listOf(m.subject)
        RuleField.BODY -> listOf(m.body)
        RuleField.ANY -> listOf(m.from, m.fromName, m.to, m.cc, m.subject)
        RuleField.ALL -> listOf("")
    }

    fun matches(r: Rule, m: Incoming): Boolean {
        if (r.field == RuleField.ALL) return true
        val v = r.value.trim().lowercase()
        if (v.isEmpty()) return false
        val texts = hay(r, m).map { it.lowercase() }
        return when (r.op) {
            RuleOp.CONTAINS -> texts.any { it.contains(v) }
            RuleOp.NOT_CONTAINS -> texts.none { it.contains(v) }
            RuleOp.EQUALS -> texts.any { it.trim() == v }
            RuleOp.STARTS -> texts.any { it.trim().startsWith(v) }
            RuleOp.ENDS -> texts.any { it.trim().endsWith(v) }
        }
    }

    fun decide(rules: List<Rule>, blocklist: List<BlockEntry>, m: Incoming): Decision {
        if (blocklist.any { it.matches(m.from) }) return Decision(spam = true, blocked = true, matched = listOf(tr("Gesperrter Absender")))
        var d = Decision()
        for (r in rules) {
            if (!r.enabled || !matches(r, m)) continue
            d = d.copy(matched = d.matched + r.name)
            d = when (r.action) {
                RuleAction.MOVE -> d.copy(moveTo = r.arg.trim().ifEmpty { null } ?: d.moveTo)
                RuleAction.CATEGORY -> d.copy(category = Category.of(r.arg))
                RuleAction.READ -> d.copy(read = true)
                RuleAction.FLAG -> d.copy(flag = true)
                RuleAction.PIN -> d.copy(pin = true)
                RuleAction.FORWARD -> d.copy(forwardTo = d.forwardTo + r.arg.split(',', ';', ' ').map { it.trim() }.filter { it.contains('@') })
                RuleAction.SPAM -> d.copy(spam = true)
                RuleAction.DELETE -> d.copy(delete = true)
            }
            if (r.stop) break
        }
        return d
    }

    /** Mails, die schon automatisch weitergeleitet wurden, nie erneut weiterleiten (Schleifenschutz). */
    fun isAutomatedForward(headers: Map<String, String>) =
        headers["x-mailwerk-auto"] != null || headers["auto-submitted"]?.lowercase()?.startsWith("auto-forwarded") == true

    /**
     * Automatisch erzeugte Mails (Newsletter, Bounces, Abwesenheitsnotizen, bereits weitergeleitete Mails).
     * Auf solche wird nie automatisch geantwortet oder weitergeleitet – verhindert Mail-Schleifen.
     */
    fun isAutomated(from: String, headers: Map<String, String>): Boolean {
        val local = from.substringBefore('@').lowercase()
        val auto = headers["auto-submitted"]?.lowercase()
        val prec = headers["precedence"]?.lowercase()
        return (auto != null && auto != "no") || prec in setOf("bulk", "list", "junk") ||
            headers.containsKey("list-id") || headers.containsKey("list-unsubscribe") || headers.containsKey("x-mailwerk-auto") ||
            Regex("^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?)").containsMatchIn(local)
    }
}
