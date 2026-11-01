package de.familie.familienkalender

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
                else -> result.notImplemented()
            }
        }
    }
}
