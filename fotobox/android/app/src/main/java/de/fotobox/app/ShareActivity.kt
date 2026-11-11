package de.fotobox.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast

/** „Teilen → Zur FotoBox“ aus jeder App. */
class ShareActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!Prefs(this).loggedIn) {
            Toast.makeText(this, "Bitte zuerst in der FotoBox-App anmelden", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, MainActivity::class.java)); finish(); return
        }
        val uris = mutableListOf<Uri>()
        @Suppress("DEPRECATION")
        when (intent.action) {
            Intent.ACTION_SEND -> (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { uris += it }
            Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris += it }
        }
        if (uris.isEmpty()) intent.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let { uris += it } }
        if (uris.isEmpty()) {
            Toast.makeText(this, "Nichts zum Hochladen", Toast.LENGTH_SHORT).show(); finish(); return
        }
        // Kopieren, solange wir noch Lesezugriff haben, dann im Hintergrund hochladen.
        Toast.makeText(this, "${uris.size} Datei(en) gehen zur FotoBox …", Toast.LENGTH_SHORT).show()
        Thread {
            FileQueue.add(applicationContext, uris)
            Scheduler.uploadFiles(applicationContext)
            runOnUiThread { finish() }
        }.start()
    }
}
