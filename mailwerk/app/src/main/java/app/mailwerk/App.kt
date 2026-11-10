package app.mailwerk

import android.app.Application
import app.mailwerk.data.Prefs
import app.mailwerk.sync.Notifier
import app.mailwerk.sync.Scheduler

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        runCatching { Scheduler.schedulePeriodic(this, Prefs(this).syncMinutes) }
    }
}
