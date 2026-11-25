package app.nfcwerkstatt

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NdefMessage
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import app.nfcwerkstatt.ui.App
import app.nfcwerkstatt.ui.theme.NfcTheme

class MainActivity : ComponentActivity(), NfcAdapter.ReaderCallback {

    private val vm: MainViewModel by viewModels()
    private var adapter: NfcAdapter? = null

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            updateNfcState()
            if (adapter?.isEnabled == true) enableReader()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        adapter = NfcAdapter.getDefaultAdapter(this)
        updateNfcState()
        ContextCompat.registerReceiver(
            this, stateReceiver,
            IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        if (savedInstanceState == null) handleIntent(intent)
        setContent {
            NfcTheme {
                App(vm = vm, onOpenNfcSettings = ::openNfcSettings)
            }
        }
    }

    override fun onDestroy() {
        unregisterReceiver(stateReceiver)
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        updateNfcState()
        enableReader()
    }

    override fun onPause() {
        super.onPause()
        runCatching { adapter?.disableReaderMode(this) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Reader-Modus: Die App bekommt alle Tags exklusiv, solange sie im Vordergrund ist. */
    private fun enableReader() {
        val a = adapter ?: return
        if (!a.isEnabled) return
        val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V or
            NfcAdapter.FLAG_READER_NFC_BARCODE
        val extras = Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250) }
        runCatching { a.enableReaderMode(this, this, flags, extras) }
    }

    override fun onTagDiscovered(tag: Tag) {
        vm.onTag(tag)
    }

    /** Tag, mit dem die App von außen gestartet wurde. */
    private fun handleIntent(intent: Intent?) {
        val action = intent?.action ?: return
        if (action != NfcAdapter.ACTION_NDEF_DISCOVERED &&
            action != NfcAdapter.ACTION_TECH_DISCOVERED &&
            action != NfcAdapter.ACTION_TAG_DISCOVERED
        ) return
        val tag = IntentCompat.getParcelableExtra(intent, NfcAdapter.EXTRA_TAG, Tag::class.java) ?: return
        val messages = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES, NdefMessage::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)?.filterIsInstance<NdefMessage>()?.toTypedArray()
        }
        Thread { vm.onTag(tag, messages?.firstOrNull()) }.start()
    }

    private fun updateNfcState() {
        val a = adapter
        vm.nfcState.value = when {
            a == null -> NfcState.MISSING
            !a.isEnabled -> NfcState.OFF
            else -> NfcState.ON
        }
    }

    private fun openNfcSettings() {
        val intent = Intent(Settings.ACTION_NFC_SETTINGS)
        runCatching { startActivity(intent) }.onFailure {
            runCatching { startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS)) }
        }
    }
}
