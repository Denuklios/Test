package app.mailwerk

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.test.core.app.ApplicationProvider
import app.mailwerk.sync.UpdateResultReceiver
import app.mailwerk.sync.Updater
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

/** Automatisches Update: Installations-Sitzung wird angelegt, Rückfrage von Android landet als Hinweis. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AutoUpdateTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    private val ctx = ApplicationProvider.getApplicationContext<Context>()

    @Test fun sessionIsCreatedAndCommitted() {
        val apk = File(ctx.cacheDir, "t.apk").apply { writeBytes(ByteArray(200_000) { it.toByte() }) }
        Updater.sessionInstall(ctx, apk, foreground = false)
        val sessions = ctx.packageManager.packageInstaller.allSessions
        assertEquals(1, sessions.size)
        assertEquals(ctx.packageName, sessions.single().appPackageName)
    }

    @Test fun userActionInBackgroundBecomesNotification() {
        val confirm = Intent("android.content.pm.action.CONFIRM_INSTALL")
        UpdateResultReceiver().onReceive(ctx, Intent(Updater.ACTION_RESULT)
            .putExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_PENDING_USER_ACTION)
            .putExtra(Intent.EXTRA_INTENT, confirm).putExtra(Updater.EXTRA_FOREGROUND, false))
        val n = shadowOf(ctx.getSystemService(NotificationManager::class.java)).allNotifications
        assertTrue(n.any { shadowOf(it).contentTitle == "Mailwerk-Update bereit" })
    }

    @Test fun userActionInForegroundOpensConfirmation() {
        val confirm = Intent("android.content.pm.action.CONFIRM_INSTALL")
        UpdateResultReceiver().onReceive(ctx, Intent(Updater.ACTION_RESULT)
            .putExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_PENDING_USER_ACTION)
            .putExtra(Intent.EXTRA_INTENT, confirm).putExtra(Updater.EXTRA_FOREGROUND, true))
        assertEquals("android.content.pm.action.CONFIRM_INSTALL", shadowOf(ctx as android.app.Application).nextStartedActivity.action)
    }
}
