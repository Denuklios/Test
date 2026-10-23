package de.obdwerkstatt.ui;

import android.view.View;

/** Eine Seite der App. MainActivity verwaltet sie als Stapel. */
public abstract class Screen {
    protected MainActivity act;
    private View view;

    public abstract String title();

    protected abstract View create();

    final View view(MainActivity a) {
        act = a;
        if (view == null) view = create();
        return view;
    }

    /** Seite wird sichtbar. */
    public void onShow() {
    }

    /** Seite wird verlassen oder verdeckt. */
    public void onHide() {
    }

    /** Verbindungsstatus hat sich geändert. */
    public void onConnectionChanged() {
    }
}
