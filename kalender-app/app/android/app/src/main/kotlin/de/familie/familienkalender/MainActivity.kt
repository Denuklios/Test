package de.familie.familienkalender

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kalender/prep").setMethodCallHandler { call, result ->
            when (call.method) {
                "update" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: true
                    val entries = call.argument<String>("entries") ?: "[]"
                    PrepScheduler.save(this, enabled, entries)
                    PrepScheduler.apply(this)
                    result.success(true)
                }
                "appVersion" -> {
                    val info = packageManager.getPackageInfo(packageName, 0)
                    result.success(info.versionName)
                }
                "installApk" -> {
                    if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                        result.success("permission")
                    } else {
                        val f = java.io.File(call.argument<String>("path")!!)
                        val uri = FileProvider.getUriForFile(this, "$packageName.updates", f)
                        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(i)
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
