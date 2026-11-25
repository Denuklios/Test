package app.nfcwerkstatt

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.widget.Toast
import app.nfcwerkstatt.automation.ActionRunner
import app.nfcwerkstatt.automation.ActionStore
import app.nfcwerkstatt.automation.ActionTag

/**
 * Unsichtbar: startet, wenn ein Aktions-Tag gescannt wird (App geschlossen),
 * führt die Aktion aus, zeigt eine kurze Meldung und schließt sich.
 */
class ActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val messages = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES, NdefMessage::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)?.filterIsInstance<NdefMessage>()?.toTypedArray()
        }
        val id = ActionTag.findId(messages?.firstOrNull())
        val action = id?.let { ActionStore(this).find(it) }
        if (action == null) {
            Toast.makeText(this, "Unbekannte Aktion – auf diesem Handy nicht angelegt.", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        val app = applicationContext
        Thread {
            val results = ActionRunner.run(app, action)
            runOnUiThread {
                val ok = results.all { it.ok }
                Toast.makeText(app, ActionRunner.summary(action, results), if (ok) Toast.LENGTH_SHORT else Toast.LENGTH_LONG).show()
                runCatching {
                    getSystemService(Vibrator::class.java)?.vibrate(
                        if (ok) VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE)
                        else VibrationEffect.createWaveform(longArrayOf(0, 80, 80, 80), -1),
                    )
                }
                finish()
            }
        }.start()
    }
}
