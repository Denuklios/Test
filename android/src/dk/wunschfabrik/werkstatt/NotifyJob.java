package dk.wunschfabrik.werkstatt;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Hintergrundauftrag (etwa alle 15 Minuten, auch nach Neustart): beim Server nach Neuem fragen. */
public class NotifyJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            Notifier.check(getApplicationContext());
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
