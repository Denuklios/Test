package app.mailwerk.data

import android.content.Context
import app.mailwerk.mail.AutoConfig

/**
 * Vorbereitete Konten: Beim ersten Start muss nur noch das Passwort eingegeben werden.
 * Die Liste steht in assets/preset_accounts.txt (eine Zeile pro Konto: "Name|adresse@domain").
 * Die Datei ist absichtlich nicht im Repo (persönliche Adressen). Passwörter stehen nirgends –
 * sie werden auf dem Gerät eingegeben und im Android-Keystore verschlüsselt.
 */
object PresetAccounts {
    data class Preset(val name: String, val email: String)

    @Volatile var list: List<Preset> = emptyList()
        private set

    fun load(ctx: Context) {
        list = runCatching { ctx.assets.open("preset_accounts.txt").bufferedReader().readText() }.getOrDefault("").let(::parse)
    }

    fun parse(text: String): List<Preset> = text.lines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }
        .mapNotNull { l -> l.split('|').takeIf { it.size == 2 && it[1].contains('@') }?.let { Preset(it[0].trim(), it[1].trim()) } }

    fun toAccount(p: Preset, name: String = p.name): Account {
        val c = AutoConfig.presets[p.email.substringAfter('@').lowercase()] ?: AutoConfig.ONE_COM
        return Account(
            name = name, email = p.email, imapHost = c.imapHost, imapPort = c.imapPort, imapSecurity = c.imapSecurity,
            smtpHost = c.smtpHost, smtpPort = c.smtpPort, smtpSecurity = c.smtpSecurity, username = p.email, passwordEnc = "",
        )
    }

    fun pending(existing: List<Account>): List<Preset> {
        val have = existing.map { it.email.lowercase() }.toSet()
        return list.filter { it.email.lowercase() !in have }
    }
}
