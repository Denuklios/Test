package de.obdwerkstatt.ui;

import android.app.ProgressDialog;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Aufgabe, die im Arbeits-Thread läuft und ihr Ergebnis im UI-Thread meldet.
 */
public abstract class Job<T> {
    MainActivity act;
    private ProgressDialog dialog;
    final AtomicBoolean cancelled = new AtomicBoolean();

    public abstract T run() throws Exception;

    public void done(T result) {
    }

    public void failed(Exception e) {
        act.alert("Fehler", e.getMessage() == null ? e.toString() : e.getMessage());
    }

    /** Fortschrittstext aus dem Arbeits-Thread aktualisieren. */
    protected void progress(final String text) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (dialog != null) dialog.setMessage(text);
            }
        });
    }

    public boolean isCancelled() {
        return cancelled.get();
    }

    public void cancel() {
        cancelled.set(true);
    }

    /** Startet die Aufgabe; mit Text wird ein Fortschrittsdialog angezeigt. */
    public void start(MainActivity a, String progressText) {
        act = a;
        if (progressText != null) {
            dialog = new ProgressDialog(a);
            dialog.setMessage(progressText);
            dialog.setCancelable(true);
            dialog.setCanceledOnTouchOutside(false);
            dialog.setOnCancelListener(new android.content.DialogInterface.OnCancelListener() {
                @Override
                public void onCancel(android.content.DialogInterface d) {
                    cancel();
                }
            });
            dialog.show();
        }
        Session.WORKER.execute(new Runnable() {
            @Override
            public void run() {
                T r = null;
                Exception err = null;
                try {
                    r = Job.this.run();
                } catch (Exception e) {
                    err = e;
                }
                final T res = r;
                final Exception ex = err;
                act.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (dialog != null && dialog.isShowing()) {
                            try {
                                dialog.dismiss();
                            } catch (Exception ignored) {
                            }
                        }
                        if (Session.transport != null && Session.transport.isFailed()) {
                            Session.disconnect();
                            act.connectionChanged();
                        }
                        if (act.isFinishing()) return;
                        if (ex != null) failed(ex);
                        else done(res);
                    }
                });
            }
        });
    }
}
