package app.mailwerk

import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
import app.mailwerk.data.Api
import app.mailwerk.data.Db
import app.mailwerk.data.FamilyCalendar
import app.mailwerk.data.Repository
import app.mailwerk.data.Security
import app.mailwerk.mail.Ics
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import jakarta.activation.DataHandler
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import jakarta.mail.util.ByteArrayDataSource
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.net.InetAddress
import java.net.ServerSocket
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Properties

/** Nachbau des Kalender-Servers (api.php) für Tests: ping, group, sync, save. */
class FakeCalendarServer(val code: String = "ABCD2345") {
    val items = mutableMapOf<String, JSONObject>() // "kind/id" -> Daten
    private var ts = 1000L
    val saves = mutableListOf<JSONObject>()
    private val sock = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    val url get() = "http://127.0.0.1:${sock.localPort}/kalender/api.php"

    init {
        Thread {
            while (!sock.isClosed) {
                val c = runCatching { sock.accept() }.getOrNull() ?: break
                c.use { s ->
                    val inp = java.io.BufferedInputStream(s.getInputStream())
                    fun line(): String { val b = StringBuilder(); while (true) { val ch = inp.read(); if (ch < 0 || ch == '\n'.code) break; if (ch != '\r'.code) b.append(ch.toChar()) }; return b.toString() }
                    val path = line().split(' ').getOrElse(1) { "/" }
                    val headers = generateSequence { line().takeIf { it.isNotEmpty() } }.associate { it.substringBefore(':').trim().lowercase() to it.substringAfter(':').trim() }
                    val len = headers["content-length"]?.toIntOrNull() ?: 0
                    val body = String(inp.readNBytes(len), Charsets.UTF_8)
                    val bytes = synchronized(this) { handle(path, headers["x-group-key"], body) }.toString().toByteArray()
                    s.getOutputStream().apply {
                        write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        write(bytes); flush()
                    }
                }
            }
        }.apply { isDaemon = true }.start()
    }

    private fun handle(path: String, header: String?, body: String): JSONObject {
        val q = path.substringAfter('?', "").split('&').filter { it.contains('=') }.associate { it.substringBefore('=') to it.substringAfter('=') }
        val key = header ?: q["k"]
        return when (q["a"]) {
            "ping" -> JSONObject().put("ok", true).put("app", "familienkalender").put("version", 1)
            else -> if (key != code) JSONObject().put("ok", false).put("error", "Gruppen-Code unbekannt") else when (q["a"]) {
                "group" -> JSONObject().put("ok", true).put("name", "Familie Muster").put("code", code)
                "sync" -> {
                    val since = q["since"]?.toLongOrNull() ?: 0
                    val sel = items.filter { it.value.optLong("updatedAt") > since }
                    fun kind(k: String) = JSONArray(sel.filterKeys { it.startsWith("$k/") }.values.toList())
                    JSONObject().put("ok", true).put("group", "Familie Muster").put("since", ts)
                        .put("members", kind("member")).put("events", kind("event"))
                }
                "save" -> {
                    val b = JSONObject(body); val item = b.getJSONObject("item"); ts++
                    item.put("updatedAt", ts); items["${b.getString("kind")}/${item.getString("id")}"] = item; saves += item
                    JSONObject().put("ok", true).put("updatedAt", ts)
                }
                else -> JSONObject().put("ok", false).put("error", "Unbekannte Aktion")
            }
        }
    }

    fun member(id: String, name: String, color: Long) {
        ts++; items["member/$id"] = JSONObject().put("id", id).put("name", name).put("color", color).put("deleted", false).put("updatedAt", ts)
    }
    fun events() = items.filterKeys { it.startsWith("event/") }.values.toList()
    fun stop() = sock.close()
}

class IcsTest {
    private val berlin = ZoneId.of("Europe/Berlin")

    @Test fun outlookInvitationWithWindowsZoneAndAlarm() {
        val ics = """
            BEGIN:VCALENDAR
            METHOD:REQUEST
            PRODID:Microsoft Exchange Server 2010
            BEGIN:VTIMEZONE
            TZID:W. Europe Standard Time
            BEGIN:STANDARD
            DTSTART:16010101T030000
            TZOFFSETFROM:+0200
            TZOFFSETTO:+0100
            END:STANDARD
            END:VTIMEZONE
            BEGIN:VEVENT
            ORGANIZER;CN="Praxis Dr. Sommer":mailto:praxis@example.org
            DESCRIPTION;LANGUAGE=de-DE:Bitte Versichertenkarte mitbringen.\nDanke\, Ihr Team
            UID:040000008200E00074C5B7101A82E0080000000
            SUMMARY;LANGUAGE=de-DE:Zahnarzt Kontrolle
            DTSTART;TZID=W. Europe Standard Time:20261203T093000
            DTEND;TZID=W. Europe Standard Time:20261203T101500
            LOCATION;LANGUAGE=de-DE:Hauptstraße 5\, Berlin
            SEQUENCE:0
            BEGIN:VALARM
            ACTION:DISPLAY
            TRIGGER:-PT15M
            END:VALARM
            END:VEVENT
            END:VCALENDAR
        """.trimIndent().replace("\n", "\r\n")
        val ev = Ics.parse(ics, berlin).single()
        assertEquals("Zahnarzt Kontrolle", ev.summary)
        assertEquals(LocalDateTime.of(2026, 12, 3, 9, 30), ev.start)
        assertEquals(LocalDateTime.of(2026, 12, 3, 10, 15), ev.end)
        assertEquals("Hauptstraße 5, Berlin", ev.location)
        assertEquals("Bitte Versichertenkarte mitbringen.\nDanke, Ihr Team", ev.description)
        assertEquals("Praxis Dr. Sommer <praxis@example.org>", ev.organizer)
        assertEquals(listOf(15), ev.reminders)
        assertFalse(ev.allDay); assertFalse(ev.isCancel); assertEquals("REQUEST", ev.method)
    }

    @Test fun googleUtcTimesFoldedLinesAndWeeklyCount() {
        val ics = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nDTSTART:20260714T160000Z\r\nDTEND:20260714T173000Z\r\n" +
            "RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=TU\r\nUID:abc123@google.com\r\nSUMMARY:Fußballtraining mit anschließ\r\n endem Grillen\r\n" +
            "END:VEVENT\r\nEND:VCALENDAR\r\n"
        val ev = Ics.parse(ics, berlin).single()
        assertEquals("Fußballtraining mit anschließendem Grillen", ev.summary)
        assertEquals(LocalDateTime.of(2026, 7, 14, 18, 0), ev.start) // Sommerzeit: UTC+2
        assertEquals("weekly", ev.repeat)
        assertEquals(LocalDate.of(2026, 9, 15), ev.repeatUntil)
    }

    @Test fun allDayMultiDayAndCancel() {
        val ics = "BEGIN:VCALENDAR\nMETHOD:CANCEL\nBEGIN:VEVENT\nUID:urlaub-1\nDTSTART;VALUE=DATE:20261228\nDTEND;VALUE=DATE:20270102\n" +
            "SUMMARY:Skiurlaub\nSTATUS:CANCELLED\nEND:VEVENT\nEND:VCALENDAR"
        val ev = Ics.parse(ics, berlin).single()
        assertTrue(ev.allDay); assertTrue(ev.isCancel)
        assertEquals(LocalDate.of(2026, 12, 28), ev.start.toLocalDate())
        assertEquals(LocalDate.of(2027, 1, 1), ev.end.toLocalDate()) // letzter Tag inklusive
    }

    @Test fun unsupportedRepeatGoesToNotes() {
        val ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART:20261201T080000\nDURATION:PT2H\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\nSUMMARY:Kurs\nEND:VEVENT\nEND:VCALENDAR"
        val ev = Ics.parse(ics, berlin).single()
        assertEquals(LocalDateTime.of(2026, 12, 1, 10, 0), ev.end)
        assertEquals("none", ev.repeat); assertTrue(ev.repeatNote.contains("BYDAY=MO,WE"))
    }

    @Test fun mergeTwoRecipientsAndCancelForOne() {
        val ev = Ics.parse("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:elternabend\nDTSTART:20261110T193000\nDTEND:20261110T210000\nSUMMARY:Elternabend\nEND:VEVENT\nEND:VCALENDAR", berlin).single()
        val first = FamilyCalendar.merge(null, ev, "mama", "Schule – Elternabend")!!
        assertEquals("mama", first.getString("ownerId")); assertEquals(0, first.getJSONArray("participants").length())
        assertEquals("2026-11-10T19:30:00", first.getString("start")); assertEquals(FamilyCalendar.eventId(ev), first.getString("id"))
        assertTrue(first.getString("notes").contains("Schule – Elternabend"))
        val both = FamilyCalendar.merge(first, ev, "papa", "")!!
        assertEquals("mama", both.getString("ownerId")); assertEquals("papa", both.getJSONArray("participants").getString(0))
        val cancelMama = FamilyCalendar.merge(both, ev.copy(method = "CANCEL"), "mama", "")!!
        assertEquals("papa", cancelMama.getString("ownerId")); assertFalse(cancelMama.getBoolean("deleted"))
        val cancelPapa = FamilyCalendar.merge(cancelMama, ev.copy(method = "CANCEL"), "papa", "")!!
        assertTrue(cancelPapa.getBoolean("deleted"))
        assertNull(FamilyCalendar.merge(null, ev.copy(method = "CANCEL"), "papa", ""))
    }

    @Test fun inviteTextFromCalendarApp() {
        val (url, code) = Api.parseInvite("Komm in unseren Familienkalender „Muster“! 📅\nApp installieren, dann diese Nachricht beim Start einfügen.\n" +
            "Server: https://www.example.org/kalender/api.php\nCode: K7MZ4QPA")
        assertEquals("https://www.example.org/kalender/api.php", url); assertEquals("K7MZ4QPA", code)
        assertEquals("https://example.org/kalender/api.php", Api.normalizeUrl("example.org/kalender/"))
        assertTrue(Api.isCalendarApiLink("https://www.wunsch-fabrik.dk/kalender/api.php"))
        assertFalse(Api.isCalendarApiLink("https://www.wunsch-fabrik.dk/kalender/api.php?a=photo&name=x"))
        assertFalse(Api.isCalendarApiLink("https://www.wunsch-fabrik.dk/kalender/"))
    }
}

/** Ende-zu-Ende: Einladung kommt per Mail bei zwei Familienmitgliedern an -> ein Termin in beiden Farben. */
@RunWith(RobolectricTestRunner::class)
class FamilyCalendarFlowTest {
    private val oldTz = java.util.TimeZone.getDefault()
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN); java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/Berlin")) }
    private val gm = GreenMail(arrayOf(ServerSetup(3145, null, "imap"), ServerSetup(3027, null, "smtp"))).also { it.start() }
    private val cal = FakeCalendarServer()
    @After fun stop() { gm.stop(); cal.stop(); java.util.TimeZone.setDefault(oldTz) }

    private fun invite(uid: String, start: LocalDateTime, method: String = "REQUEST", title: String = "Elternabend Klasse 3b") =
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:$method\r\nBEGIN:VEVENT\r\nUID:$uid\r\n" +
            "DTSTART;TZID=Europe/Berlin:${start.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss"))}\r\n" +
            "DTEND;TZID=Europe/Berlin:${start.plusHours(2).format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss"))}\r\n" +
            "SUMMARY:$title\r\nLOCATION:Aula\r\n${if (method == "CANCEL") "STATUS:CANCELLED\r\n" else ""}END:VEVENT\r\nEND:VCALENDAR\r\n"

    private fun deliver(to: String, subject: String, ics: String, asAttachment: Boolean = false) {
        val m = MimeMessage(Session.getInstance(Properties()))
        m.setFrom(InternetAddress("schule@example.org", "Grundschule")); m.setRecipients(jakarta.mail.Message.RecipientType.TO, to)
        m.subject = subject
        val text = MimeBodyPart().apply { setText("Liebe Eltern, hiermit laden wir ein.", "UTF-8") }
        val cal = MimeBodyPart().apply {
            dataHandler = DataHandler(ByteArrayDataSource(ics.toByteArray(), "text/calendar; charset=UTF-8; method=REQUEST"))
            if (asAttachment) { fileName = "einladung.ics"; disposition = "attachment" }
        }
        m.setContent(MimeMultipart("mixed", text, cal)); m.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser(to)).store(m)
    }

    @Test fun invitationLandsInFamilyCalendarInRecipientColor() = runBlocking {
        gm.setUser("mama@test.de", "mama@test.de", "pw"); gm.setUser("papa@test.de", "papa@test.de", "pw")
        cal.member("m1", "Mama", 0xFFE53935); cal.member("p1", "Papa", 0xFF1E88E5); cal.member("k1", "Kind", 0xFF43A047)
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Db.get(ctx); db.accounts().forEach { db.deleteAccount(it.id) }
        val repo = Repository.get(ctx); repo.passwordOf = { "pw" }
        fun acc(name: String, mail: String) = Account(0, name, mail, "127.0.0.1", 3145, Security.NONE, "127.0.0.1", 3027, Security.NONE, mail, "x")
        val mamaId = db.saveAccount(acc("Mama Muster", "mama@test.de"))
        val papaId = db.saveAccount(acc("Papa Muster", "papa@test.de"))
        repo.family.disconnect()

        // Alte Einladung (vergangen) schon vorhanden, bevor verbunden wird
        deliver("mama@test.de", "Sommerfest", invite("sommerfest-2020", LocalDateTime.of(2020, 6, 20, 15, 0), title = "Sommerfest"))
        assertTrue(repo.sync().isEmpty())

        // Einladung kam per Mail -> wird automatisch gefunden (Server + Code), Verbinden ohne Eintippen
        val im = MimeMessage(Session.getInstance(Properties()))
        im.setFrom(InternetAddress("oma@example.org", "Oma")); im.setRecipients(jakarta.mail.Message.RecipientType.TO, "mama@test.de")
        im.subject = "Kalender"; im.setText("Komm in unseren Familienkalender „Familie Muster“! 📅\nApp installieren, dann diese Nachricht beim Start einfügen.\n" +
            "Server: ${cal.url}\nCode: ABCD2345", "UTF-8"); im.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("mama@test.de")).store(im)
        assertTrue(repo.sync().isEmpty())
        val found = repo.family.findInvite("irgendwas anderes", db.calendarInviteTexts())!!
        assertEquals("ABCD2345", found.code); assertEquals(cal.url, found.url); assertEquals("Mail von Oma", found.source)
        // nur Code + Standard-Server
        assertEquals("ABCD2345", repo.family.findInvite("Familienkalender – Code: ABCD2345", emptyList())!!.code)
        assertNull(repo.family.findInvite("Code: 12345678 für dein Paket", emptyList()))

        // Verbinden: Konten werden über den Vornamen automatisch zugeordnet
        repo.family.defaultUrl = cal.url
        repo.family.connect("", found.code, db.accounts())
        assertEquals(cal.url, repo.family.serverUrl)
        assertEquals("Familie Muster", repo.family.groupName)
        assertEquals(listOf("Kind", "Mama", "Papa"), repo.family.members.map { it.name })
        assertEquals(0xFFE53935.toInt(), repo.family.members.first { it.name == "Mama" }.color)
        assertEquals("m1", repo.family.memberFor(mamaId)?.id); assertEquals("p1", repo.family.memberFor(papaId)?.id)

        // Neue Einladung an Mama (inline) und dieselbe an Papa (als .ics-Anhang)
        val start = LocalDateTime.now().plusDays(10).withHour(19).withMinute(30).withSecond(0).withNano(0)
        deliver("mama@test.de", "Einladung: Elternabend", invite("elternabend-3b@schule", start))
        deliver("papa@test.de", "Einladung: Elternabend", invite("elternabend-3b@schule", start), asAttachment = true)
        assertTrue(repo.sync().isEmpty())

        val evs = cal.events()
        assertEquals("nur der neue Termin, nicht der vergangene", 1, evs.size)
        val ev = evs.single()
        assertEquals("Elternabend Klasse 3b", ev.getString("title"))
        assertEquals("Aula", ev.getString("location"))
        assertEquals(FamilyCalendar.isoLocal(start), ev.getString("start"))
        val people = listOf(ev.getString("ownerId")) + (0 until ev.getJSONArray("participants").length()).map { ev.getJSONArray("participants").getString(it) }
        assertEquals(setOf("m1", "p1"), people.toSet())
        assertTrue(ev.getString("notes").contains("Grundschule"))

        // Status an der Mail
        val mamaMsg = db.search("Einladung: Elternabend").first { it.accountId == mamaId }
        val inv = db.invite(mamaMsg.id)!!
        assertEquals(FamilyCalendar.STATUS_ADDED, inv.status); assertEquals("Mama", inv.info)
        val old = db.search("Sommerfest").single()
        assertEquals(Repository.STATUS_OLD, db.invite(old.id)!!.status)

        // Vergangenen Termin trotzdem von Hand eintragen
        assertEquals("Im Familienkalender eingetragen", repo.addInviteToCalendar(old.id))
        assertEquals(2, cal.events().size)

        // Absage an Papa: Papa fällt raus, Mama bleibt
        deliver("papa@test.de", "Abgesagt: Elternabend", invite("elternabend-3b@schule", start, method = "CANCEL"))
        assertTrue(repo.sync().isEmpty())
        val after = cal.events().first { it.getString("title") == "Elternabend Klasse 3b" }
        assertEquals("m1", after.getString("ownerId")); assertEquals(0, after.getJSONArray("participants").length())
        assertFalse(after.getBoolean("deleted"))

        // Ganz normale Mail mit Frist im Text -> Frist in Papas Farbe
        val tm = MimeMessage(Session.getInstance(Properties()))
        tm.setFrom(InternetAddress("trainer@verein.example", "Tom Trainer")); tm.setRecipients(jakarta.mail.Message.RecipientType.TO, "papa@test.de")
        tm.subject = "Re: Turnier"; tm.setText("Hallo,\nbitte melde dich bis Montag 16:00, ob ihr beim Turnier dabei seid.\nGruß Tom", "UTF-8"); tm.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("papa@test.de")).store(tm)
        assertTrue(repo.sync().isEmpty())
        val frist = cal.events().single { it.getString("title") == "Frist: Turnier" }
        assertEquals("p1", frist.getString("ownerId")); assertEquals("16:00:00", frist.getString("start").substringAfter('T'))
        assertTrue(frist.getString("notes").contains("bis Montag 16:00"))

        // Mail an sich selbst: „treffen morgen um 19:00 in Flensburg“ -> Termin mit Ort
        val sm = MimeMessage(Session.getInstance(Properties()))
        sm.setFrom(InternetAddress("mama@test.de", "Mama Muster")); sm.setRecipients(jakarta.mail.Message.RecipientType.TO, "mama@test.de")
        sm.subject = "Test"; sm.setText("treffen morgen um 19:00 in Flensburg", "UTF-8"); sm.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("mama@test.de")).store(sm)
        assertTrue(repo.sync().isEmpty())
        val treffen = cal.events().single { it.getString("title") == "Test" }
        assertEquals("m1", treffen.getString("ownerId")); assertEquals("Flensburg", treffen.getString("location"))
        assertEquals(FamilyCalendar.isoLocal(LocalDateTime.now().plusDays(1).withHour(19).withMinute(0)), treffen.getString("start"))

        // Mail, die schon VOR der verbesserten Erkennung abgerufen wurde -> wird beim nächsten Abgleich nachgeholt
        val km = MimeMessage(Session.getInstance(Properties()))
        km.setFrom(InternetAddress("papa@test.de", "Papa Muster")); km.setRecipients(jakarta.mail.Message.RecipientType.TO, "papa@test.de")
        km.setText("Morgen ins Kino um 20:00", "UTF-8"); km.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("papa@test.de")).store(km)
        repo.family.detectText = false; assertTrue(repo.sync().isEmpty()); repo.family.detectText = true // simuliert „alte Version“
        assertTrue(cal.events().none { it.getString("title") == "Kino" })
        repo.family.rescanVersion = 0
        assertTrue(repo.sync().isEmpty())
        val kino = cal.events().single { it.getString("title") == "Kino" }
        assertEquals("p1", kino.getString("ownerId"))
        assertEquals(FamilyCalendar.isoLocal(LocalDateTime.now().plusDays(1).withHour(20).withMinute(0)), kino.getString("start"))

        // Knopf „In Kalender“: Mail ohne erkennbares Datum von Hand eintragen, für Mama und Kind
        val plain = db.search("Abgesagt: Elternabend").first()
        val mstart = LocalDateTime.now().plusDays(3).withHour(17).withMinute(15).withSecond(0).withNano(0)
        assertEquals("Im Familienkalender eingetragen",
            repo.addToCalendarManually(plain.id, "Laternelaufen", mstart, mstart.plusHours(2), false, "Schulhof", listOf("m1", "k1")))
        val lat = cal.events().single { it.getString("title") == "Laternelaufen" }
        assertEquals("m1", lat.getString("ownerId")); assertEquals("k1", lat.getJSONArray("participants").getString(0))
        assertEquals("Schulhof", lat.getString("location")); assertEquals(FamilyCalendar.isoLocal(mstart), lat.getString("start"))
        assertEquals(FamilyCalendar.STATUS_ADDED, db.invite(plain.id)!!.status)
        assertEquals("Mama, Kind", db.invite(plain.id)!!.info)
        // zweimal drücken ändert denselben Termin statt einen neuen anzulegen
        repo.addToCalendarManually(plain.id, "Laternelaufen", mstart.plusHours(1), mstart.plusHours(2), false, "Schulhof", listOf("m1"))
        assertEquals(1, cal.events().count { it.getString("title") == "Laternelaufen" })
        // nicht verbunden -> klare Meldung
        val url = repo.family.serverUrl; val code = repo.family.code
        repo.family.code = ""
        assertTrue(repo.addToCalendarManually(plain.id, "X", mstart, mstart, true, "", listOf("m1")).contains("nicht verbunden"))
        repo.family.code = code; assertEquals(url, repo.family.serverUrl)

        // Zuordnung über die Mailadresse: Konto „Wunsch-Fabrik“ mit robert@… -> Robert; mehrdeutig/fremd -> keine
        cal.member("r1", "Robert", 0xFF5E35B1)
        repo.family.refreshMembers()
        val rob = db.saveAccount(acc("Wunsch-Fabrik", "robert@test.de"))
        val shop = db.saveAccount(acc("Wunsch-Fabrik", "hej@test.de"))
        repo.family.autoMap(db.accounts())
        assertEquals("r1", repo.family.memberFor(rob)?.id)
        assertNull(repo.family.memberFor(shop))
        db.deleteAccount(rob); db.deleteAccount(shop)

        // Im Kalender hinterlegte Mailadressen: Mail an Kind (über Mamas Postfach, Kind in Cc) -> Termin für beide
        cal.items["member/k1"]!!.put("emails", org.json.JSONArray(listOf("Kind@Test.de"))).put("updatedAt", 99_999L)
        repo.family.refreshMembers()
        assertEquals(listOf("kind@test.de"), repo.family.members.first { it.id == "k1" }.emails)
        val cm = MimeMessage(Session.getInstance(Properties()))
        cm.setFrom(InternetAddress("verein@example.org", "Sportverein")); cm.setRecipients(jakarta.mail.Message.RecipientType.TO, "mama@test.de")
        cm.setRecipients(jakarta.mail.Message.RecipientType.CC, "kind@test.de")
        cm.subject = "Training"; cm.setText("Das Training ist morgen um 17:30 in der Halle.", "UTF-8"); cm.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("mama@test.de")).store(cm)
        assertTrue(repo.sync().isEmpty())
        val tr0 = cal.events().single { it.getString("title") == "Training" }
        assertEquals("m1", tr0.getString("ownerId")) // Postfach-Inhaberin zuerst
        assertEquals("k1", tr0.getJSONArray("participants").getString(0))

        // Erneuter Abgleich trägt nichts doppelt ein
        val saves = cal.saves.size
        assertTrue(repo.sync().isEmpty())
        assertEquals(saves, cal.saves.size)
        assertNotNull(db.invite(mamaMsg.id))
        repo.family.disconnect()
    }
}
