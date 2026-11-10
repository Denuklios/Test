package app.mailwerk

import android.app.Application
import app.mailwerk.data.Prefs
import app.mailwerk.data.PresetAccounts
import app.mailwerk.sync.Notifier
import app.mailwerk.sync.Scheduler

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
        PresetAccounts.load(this)
        Notifier.createChannels(this)
        runCatching { Scheduler.schedulePeriodic(this, Prefs(this).syncMinutes) }
    }
}
