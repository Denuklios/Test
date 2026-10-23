package de.wunschfabrik.launcher;

import android.content.ComponentName;
import android.graphics.drawable.Drawable;
import android.os.UserHandle;

/** Eine startbare App (auch aus dem Arbeitsprofil). */
public final class AppEntry implements Search.Labeled {
    public final ComponentName component;
    public final UserHandle user;
    public final String key;
    public final String originalLabel;
    public final boolean workProfile;
    public String customLabel;
    public Drawable icon;

    AppEntry(ComponentName component, UserHandle user, long userSerial, String label, boolean workProfile) {
        this.component = component;
        this.user = user;
        this.key = component.flattenToShortString() + "#" + userSerial;
        this.originalLabel = label;
        this.workProfile = workProfile;
    }

    @Override public String label() {
        return customLabel != null && !customLabel.isEmpty() ? customLabel : originalLabel;
    }

    public String packageName() { return component.getPackageName(); }
}
