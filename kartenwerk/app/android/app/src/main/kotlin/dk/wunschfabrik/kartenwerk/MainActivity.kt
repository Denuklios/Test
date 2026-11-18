package dk.wunschfabrik.kartenwerk

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// FlutterFragmentActivity wird für die Fingerabdruck-Sperre (local_auth) gebraucht
class MainActivity : FlutterFragmentActivity() {
    private var incoming: ByteArray? = null

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        grab(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        grab(intent)
    }

    /** .pkpass aus „Öffnen mit“ oder „Teilen“ einlesen */
    private fun grab(i: Intent?) {
        if (i == null) return
        val uri: Uri? = when (i.action) {
            Intent.ACTION_VIEW -> i.data
            Intent.ACTION_SEND -> if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                                  else @Suppress("DEPRECATION") i.getParcelableExtra(Intent.EXTRA_STREAM)
            else -> null
        }
        if (uri == null) return
        try {
            contentResolver.openInputStream(uri)?.use { s ->
                val b = s.readBytes()
                if (b.size in 1..(50 * 1024 * 1024)) incoming = b
            }
        } catch (_: Exception) {}
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kartenwerk/native").setMethodCallHandler { call, result ->
            when (call.method) {
                "appVersion" -> result.success(packageManager.getPackageInfo(packageName, 0).versionName)
                "takeIncoming" -> { result.success(incoming); incoming = null }
                "installApk" -> {
                    if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                        result.success("permission")
                    } else {
                        val f = java.io.File(call.argument<String>("path")!!)
                        val uri = FileProvider.getUriForFile(this, "$packageName.updates", f)
                        startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
                        result.success("ok")
                    }
                }
                "installApkSilent" -> {
                    if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                        result.success("permission")
                    } else {
                        try {
                            SilentUpdate.install(this, java.io.File(call.argument<String>("path")!!))
                            result.success("ok")
                        } catch (e: Exception) {
                            result.success("error: " + e.message)
                        }
                    }
                }
                "lastUpdateError" -> {
                    val p = getSharedPreferences("updates", MODE_PRIVATE)
                    val e = p.getString("error", null)
                    p.edit().remove("error").apply()
                    result.success(e)
                }
                "openInstallSettings" -> {
                    if (Build.VERSION.SDK_INT >= 26) {
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                    }
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }
}
