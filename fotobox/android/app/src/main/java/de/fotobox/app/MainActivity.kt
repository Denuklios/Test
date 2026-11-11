package de.fotobox.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.format.DateUtils
import android.view.View
import android.widget.*

class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private val ui = Handler(Looper.getMainLooper())
    private val refresher = object : Runnable {
        override fun run() { refresh(); ui.postDelayed(this, 1500) }
    }

    private fun <T : View> v(id: Int): T = findViewById(id)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)
        Notify.setup(this)

        v<EditText>(R.id.serverUrl).setText(prefs.server)
        v<EditText>(R.id.userName).setText(prefs.user)
        v<Button>(R.id.loginBtn).setOnClickListener { login() }
        v<Button>(R.id.syncBtn).setOnClickListener {
            Scheduler.syncNow(this); toast("Sicherung gestartet")
        }
        v<Button>(R.id.uploadBtn).setOnClickListener {
            startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }, REQ_PICK)
        }
        v<Button>(R.id.browserBtn).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(prefs.server)))
        }
        v<Button>(R.id.logoutBtn).setOnClickListener {
            Scheduler.cancelAll(this)
            prefs.logout()
            UploadedDb(this).clear()
            showState()
        }
        v<TextView>(R.id.permWarn).setOnClickListener {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }

        bindOption(R.id.optVideos, prefs.videos) { prefs.videos = it }
        bindOption(R.id.optCameraOnly, prefs.cameraOnly) { prefs.cameraOnly = it }
        bindOption(R.id.optCharging, prefs.onlyCharging) { prefs.onlyCharging = it; Scheduler.schedule(this, replace = true) }

        showState()
        if (prefs.loggedIn) Scheduler.schedule(this)
    }

    private fun bindOption(id: Int, value: Boolean, set: (Boolean) -> Unit) {
        v<CheckBox>(id).apply { isChecked = value; setOnCheckedChangeListener { _, c -> set(c) } }
    }

    override fun onResume() { super.onResume(); ui.post(refresher) }
    override fun onPause() { super.onPause(); ui.removeCallbacks(refresher) }

    private fun showState() {
        val inn = prefs.loggedIn
        v<View>(R.id.setupBox).visibility = if (inn) View.GONE else View.VISIBLE
        v<View>(R.id.mainBox).visibility = if (inn) View.VISIBLE else View.GONE
        if (inn) {
            v<TextView>(R.id.account).text = "${prefs.user} · ${Uri.parse(prefs.server).host}"
            askPermissions()
        }
        v<TextView>(R.id.avatar).apply {
            visibility = if (inn) View.VISIBLE else View.GONE
            text = prefs.user.take(2).uppercase()
        }
        refresh()
    }

    private fun refresh() {
        if (!prefs.loggedIn) return
        val last = if (prefs.lastRun == 0L) "noch nie"
        else DateUtils.getRelativeTimeSpanString(prefs.lastRun, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)
        val waiting = FileQueue.pending(this).size
        v<TextView>(R.id.statCount).text = "%,d".format(java.util.Locale.GERMANY, UploadedDb(this).count())
        v<TextView>(R.id.statLast).text = last
        v<TextView>(R.id.status).text = buildString {
            append(if (prefs.lastResult.isNotEmpty()) prefs.lastResult else "Wartet auf das Heim-WLAN")
            if (waiting > 0) append("\nWartende Dateien: $waiting")
        }
        v<TextView>(R.id.progress).apply {
            text = prefs.progress
            visibility = if (prefs.progress.isEmpty()) View.GONE else View.VISIBLE
        }
        v<View>(R.id.permWarn).visibility = if (hasFullMediaAccess()) View.GONE else View.VISIBLE
    }

    private fun login() {
        var url = v<EditText>(R.id.serverUrl).text.toString().trim().trimEnd('/')
        if (url.isNotEmpty() && !url.startsWith("http")) url = "http://$url"
        if (url.isNotEmpty() && !Regex(":\\d+$").containsMatchIn(url.substringAfter("://"))) url += ":8090"
        val user = v<EditText>(R.id.userName).text.toString().trim()
        val pw = v<EditText>(R.id.password).text.toString()
        val all = v<CheckBox>(R.id.includeExisting).isChecked
        val msg = v<TextView>(R.id.loginMsg)
        val btn = v<Button>(R.id.loginBtn)
        if (url.isEmpty() || user.isEmpty() || pw.isEmpty()) { showMsg("Bitte alles ausfüllen."); return }
        btn.isEnabled = false
        msg.visibility = View.GONE
        btn.text = "Verbinde …"
        Thread {
            val result = try {
                val api = Api(url)
                if (!api.ping()) throw Exception("Server unter $url nicht gefunden. Bist du im WLAN zu Hause?")
                Result.success(api.login(user, pw, "${Build.MANUFACTURER} ${Build.MODEL}"))
            } catch (e: Exception) { Result.failure(e) }
            runOnUiThread {
                btn.isEnabled = true
                btn.text = "Anmelden"
                result.onSuccess { token ->
                    prefs.server = url; prefs.user = user; prefs.token = token
                    prefs.sinceSeconds = if (all) 0 else System.currentTimeMillis() / 1000
                    v<EditText>(R.id.password).setText("")
                    UploadedDb(this).clear()
                    Scheduler.schedule(this, replace = true)
                    showState()
                    Scheduler.syncNow(this)
                }.onFailure { showMsg(it.message ?: "Fehler") }
            }
        }.start()
    }

    private fun mediaPerms(): Array<String> = when {
        Build.VERSION.SDK_INT >= 33 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.ACCESS_MEDIA_LOCATION, Manifest.permission.POST_NOTIFICATIONS
        )
        Build.VERSION.SDK_INT >= 29 -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION)
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    private fun hasFullMediaAccess(): Boolean {
        val need = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
        return checkSelfPermission(need) == PackageManager.PERMISSION_GRANTED
    }

    private fun askPermissions() {
        val missing = mediaPerms().filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), REQ_PERM)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (hasFullMediaAccess()) Scheduler.syncNow(this)
        refresh()
    }

    @Deprecated("Activity API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_PICK || resultCode != RESULT_OK || data == null) return
        val uris = mutableListOf<Uri>()
        data.clipData?.let { c -> for (i in 0 until c.itemCount) uris += c.getItemAt(i).uri }
        if (uris.isEmpty()) data.data?.let { uris += it }
        queue(uris)
    }

    private fun queue(uris: List<Uri>) {
        if (uris.isEmpty()) return
        toast("${uris.size} Datei(en) werden vorbereitet …")
        Thread {
            val n = FileQueue.add(applicationContext, uris)
            Scheduler.uploadFiles(applicationContext)
            runOnUiThread { toast("$n Datei(en) in der Warteschlange – Upload startet"); refresh() }
        }.start()
    }

    private fun showMsg(t: String) {
        v<TextView>(R.id.loginMsg).apply { text = t; visibility = View.VISIBLE }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()

    companion object {
        const val REQ_PICK = 1
        const val REQ_PERM = 2
    }
}
