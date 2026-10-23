package de.wunschfabrik.launcher;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.SearchManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextWatcher;
import android.text.style.ForegroundColorSpan;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AbsListView;
import android.widget.AdapterView;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridView;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class MainActivity extends Activity implements AppRepository.Listener {
    private static final int MAX_FAVORITES = 28;
    /** So viele Favoriten liegen in der Leiste unten (je zwei links und rechts vom violetten Knopf). */
    private static final int DOCK_SLOTS = 4;

    private Prefs prefs;
    private AppRepository repo;
    private List<AppEntry> allApps = new ArrayList<>();
    private final Map<String, AppEntry> byKey = new HashMap<>();

    private FrameLayout root;
    private LinearLayout home;
    private LinearLayout homeContent;
    private LinearLayout clockBox;
    private LinearLayout favoritesBox;
    private TextView favoritesHint;
    private LinearLayout dock;
    private LinearLayout drawer;
    private EditText search;
    private GridView grid;
    private TextView webSearch;
    private AppAdapter adapter;
    private GestureDetector gestures;
    private WfMenu openMenu;
    private boolean drawerOpen;
    private float density;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        density = getResources().getDisplayMetrics().density;
        prefs = new Prefs(this);
        setupWindow();
        buildUi();
        gestures = new GestureDetector(this, new Swipes());
        repo = new AppRepository(this, prefs, this);
        repo.start();
    }

    @Override protected void onDestroy() {
        repo.stop();
        super.onDestroy();
    }

    // ---------- Fenster und Helfer ----------

    private void setupWindow() {
        Window w = getWindow();
        w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private int dp(float v) { return (int) (v * density + 0.5f); }

    private TextView text(float sp, int color) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(WfStyle.body(this));
        return t;
    }

    /** Kleine Überschrift in Großbuchstaben, gesperrt, violett (wie .eyebrow). */
    private TextView eyebrow(String s) {
        TextView t = text(11, WfStyle.P2);
        t.setTypeface(WfStyle.bodyMedium(this));
        t.setLetterSpacing(0.3f);
        t.setAllCaps(true);
        t.setText(s);
        return t;
    }

    private Drawable inputBackground() {
        GradientDrawable normal = new GradientDrawable();
        normal.setColor(WfStyle.INPUT);
        normal.setCornerRadius(dp(12));
        normal.setStroke(Math.max(1, dp(1)), WfStyle.LINE);
        GradientDrawable focused = new GradientDrawable();
        focused.setColor(WfStyle.INPUT);
        focused.setCornerRadius(dp(12));
        focused.setStroke(Math.max(1, dp(1)), WfStyle.P2);
        StateListDrawable s = new StateListDrawable();
        s.addState(new int[]{android.R.attr.state_focused}, focused);
        s.addState(new int[0], normal);
        return s;
    }

    private Drawable searchIcon() {
        Drawable d = getResources().getDrawable(android.R.drawable.ic_menu_search, getTheme()).mutate();
        d.setTint(WfStyle.MUTED);
        d.setBounds(0, 0, dp(22), dp(22));
        return d;
    }

    // ---------- Aufbau ----------

    private void buildUi() {
        root = new FrameLayout(this);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                int l = in.getSystemWindowInsetLeft(), r = in.getSystemWindowInsetRight();
                homeContent.setPadding(dp(16) + l, in.getSystemWindowInsetTop() + dp(20), dp(16) + r, dp(12));
                dock.setPadding(l + dp(8), 0, r + dp(8), in.getStableInsetBottom());
                LinearLayout.LayoutParams dlp = (LinearLayout.LayoutParams) dock.getLayoutParams();
                dlp.height = dp(68) + in.getStableInsetBottom();
                dock.setLayoutParams(dlp);
                drawer.setPadding(dp(8) + l, in.getSystemWindowInsetTop() + dp(14), dp(8) + r, in.getSystemWindowInsetBottom());
                return in.consumeSystemWindowInsets();
            }
        });
        root.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) { showHomeMenu(v); return true; }
        });

        buildHome();
        buildDrawer();
        root.addView(home, new FrameLayout.LayoutParams(-1, -1));
        root.addView(drawer, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        applyLayoutPrefs();
    }

    private void buildHome() {
        home = new LinearLayout(this);
        home.setOrientation(LinearLayout.VERTICAL);

        homeContent = new LinearLayout(this);
        homeContent.setOrientation(LinearLayout.VERTICAL);
        home.addView(homeContent, new LinearLayout.LayoutParams(-1, 0, 1f));

        clockBox = new LinearLayout(this);
        clockBox.setOrientation(LinearLayout.VERTICAL);
        clockBox.setPadding(dp(6), 0, dp(6), 0);

        TextView brand = text(15, WfStyle.TEXT);
        brand.setTypeface(WfStyle.head(this));
        brand.setLetterSpacing(0.28f);
        SpannableString bs = new SpannableString("WUNSCH·FABRIK");
        bs.setSpan(new ForegroundColorSpan(WfStyle.P2), 7, bs.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        brand.setText(bs);
        clockBox.addView(brand);

        TextClock clock = new TextClock(this);
        clock.setFormat24Hour("HH:mm");
        clock.setFormat12Hour("h:mm");
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 76);
        clock.setTextColor(WfStyle.TEXT);
        clock.setTypeface(WfStyle.head(this));
        clock.setIncludeFontPadding(false);
        clock.setPadding(0, dp(10), 0, dp(2));
        clock.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { startSafe(new Intent(AlarmClock.ACTION_SHOW_ALARMS)); }
        });
        clockBox.addView(clock);

        TextClock date = new TextClock(this);
        date.setFormat24Hour("EEEE, d. MMMM");
        date.setFormat12Hour("EEEE, d. MMMM");
        date.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        date.setTextColor(WfStyle.MUTED);
        date.setTypeface(WfStyle.bodyMedium(this));
        date.setLetterSpacing(0.14f);
        date.setAllCaps(true);
        date.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                startSafe(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALENDAR));
            }
        });
        clockBox.addView(date);
        homeContent.addView(clockBox);

        TextView bar = text(15, WfStyle.MUTED);
        bar.setText("Apps durchsuchen");
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setCompoundDrawablesRelative(searchIcon(), null, null, null);
        bar.setCompoundDrawablePadding(dp(12));
        bar.setPadding(dp(16), 0, dp(16), 0);
        bar.setBackground(WfStyle.card(dp(16), density));
        bar.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openDrawer(true); }
        });
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-1, dp(50));
        blp.topMargin = dp(22);
        homeContent.addView(bar, blp);

        homeContent.addView(new View(this), new LinearLayout.LayoutParams(-1, 0, 1f));

        favoritesHint = text(14, WfStyle.MUTED);
        favoritesHint.setGravity(Gravity.CENTER);
        favoritesHint.setText("Lange auf eine App tippen → „Zum Startbildschirm“");
        favoritesHint.setPadding(0, 0, 0, dp(16));
        homeContent.addView(favoritesHint);

        favoritesBox = new LinearLayout(this);
        favoritesBox.setOrientation(LinearLayout.VERTICAL);
        homeContent.addView(favoritesBox, new LinearLayout.LayoutParams(-1, -2));

        dock = new LinearLayout(this);
        dock.setGravity(Gravity.CENTER_VERTICAL);
        home.addView(dock, new LinearLayout.LayoutParams(-1, dp(68)));
    }

    /** Violetter runder Knopf mit 3×3 Punkten – öffnet alle Apps. */
    private View appsButton() {
        View fab = new View(this) {
            private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            @Override protected void onDraw(Canvas c) {
                super.onDraw(c);
                p.setColor(Color.WHITE);
                float cx = getWidth() / 2f, cy = getHeight() / 2f, gap = dp(7), r = dp(2.2f);
                for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c.drawCircle(cx + i * gap, cy + j * gap, r, p);
            }
        };
        fab.setBackground(WfStyle.fab());
        fab.setElevation(dp(8));
        fab.setContentDescription("Alle Apps");
        fab.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openDrawer(false); }
        });
        return fab;
    }

    private void buildDrawer() {
        drawer = new LinearLayout(this);
        drawer.setOrientation(LinearLayout.VERTICAL);
        drawer.setVisibility(View.GONE);
        drawer.setClickable(true);

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.addView(eyebrow("Wunsch-Fabrik"));
        TextView h = text(30, WfStyle.TEXT);
        h.setTypeface(WfStyle.head(this));
        SpannableString hs = new SpannableString("Alle Apps");
        hs.setSpan(new ForegroundColorSpan(WfStyle.P2), 5, hs.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        h.setText(hs);
        titles.addView(h);
        head.addView(titles, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView more = text(24, WfStyle.MUTED);
        more.setText("⋮");
        more.setGravity(Gravity.CENTER);
        more.setContentDescription("Einstellungen");
        more.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showSettings(); }
        });
        head.addView(more, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(-1, -2);
        hlp.setMargins(dp(8), 0, 0, dp(10));
        drawer.addView(head, hlp);

        search = new EditText(this);
        search.setHint("Suchen …");
        search.setHintTextColor(WfStyle.FAINT);
        search.setTextColor(WfStyle.TEXT);
        search.setTypeface(WfStyle.body(this));
        search.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        search.setSingleLine(true);
        search.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        search.setImeOptions(EditorInfo.IME_ACTION_GO | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        search.setBackground(inputBackground());
        search.setCompoundDrawablesRelative(searchIcon(), null, null, null);
        search.setCompoundDrawablePadding(dp(12));
        search.setPadding(dp(14), 0, dp(14), 0);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { applyFilter(); }
        });
        search.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override public boolean onEditorAction(TextView v, int id, KeyEvent ev) {
                if (adapter.getCount() > 0) launch(adapter.getItem(0), null);
                else if (search.length() > 0) webSearch();
                return true;
            }
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, dp(48));
        slp.setMargins(dp(8), 0, dp(8), dp(8));
        drawer.addView(search, slp);

        webSearch = text(15, WfStyle.P3);
        webSearch.setPadding(dp(16), dp(10), dp(16), dp(10));
        webSearch.setVisibility(View.GONE);
        webSearch.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { webSearch(); }
        });
        drawer.addView(webSearch);

        adapter = new AppAdapter(this);
        grid = new GridView(this);
        grid.setAdapter(adapter);
        grid.setVerticalSpacing(dp(6));
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
        grid.setSelector(new ColorDrawable(Color.TRANSPARENT));
        grid.setFastScrollEnabled(true);
        grid.setClipToPadding(false);
        grid.setPadding(0, 0, 0, dp(16));
        grid.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override public void onItemClick(AdapterView<?> p, View v, int pos, long id) { launch(adapter.getItem(pos), v); }
        });
        grid.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override public boolean onItemLongClick(AdapterView<?> p, View v, int pos, long id) {
                showAppMenu(v, adapter.getItem(pos), false);
                return true;
            }
        });
        grid.setOnScrollListener(new AbsListView.OnScrollListener() {
            @Override public void onScrollStateChanged(AbsListView v, int s) {
                if (s == SCROLL_STATE_TOUCH_SCROLL) hideKeyboard();
            }
            @Override public void onScroll(AbsListView v, int a, int b, int c) {}
        });
        drawer.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1f));
    }

    private void applyLayoutPrefs() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        boolean wf = prefs.wfBackground();
        root.setBackground(wf ? WfStyle.background(dm.widthPixels, dm.heightPixels) : null);
        drawer.setBackground(wf ? WfStyle.background(dm.widthPixels, dm.heightPixels) : new ColorDrawable(0xF2090909));
        GradientDrawable nav = new GradientDrawable();
        nav.setColor(wf ? WfStyle.NAV : 0xB30D0B12);
        nav.setStroke(Math.max(1, dp(1)), WfStyle.LINE);
        // Nur die obere Linie sichtbar: Rand links/rechts/unten liegt außerhalb des Bildschirms.
        android.graphics.drawable.InsetDrawable navBg = new android.graphics.drawable.InsetDrawable(nav, -dp(2), 0, -dp(2), -dp(2));
        dock.setBackground(navBg);

        adapter.iconPx = dp(prefs.iconSizeDp());
        adapter.showLabels = prefs.showLabels();
        grid.setNumColumns(prefs.columns());
        clockBox.setVisibility(prefs.showClock() ? View.VISIBLE : View.GONE);
        adapter.notifyDataSetChanged();
        grid.invalidateViews();
        renderFavorites();
    }

    // ---------- Daten ----------

    @Override public void onAppsChanged(List<AppEntry> apps) {
        allApps = apps;
        byKey.clear();
        for (AppEntry e : apps) byKey.put(e.key, e);
        if (!prefs.favoritesInitialized() && !apps.isEmpty()) {
            prefs.setFavorites(defaultFavorites());
            prefs.setFavoritesInitialized();
        }
        applyFilter();
        renderFavorites();
    }

    /** Beim ersten Start: Telefon, Nachrichten, Browser, Kamera, Galerie – sofern vorhanden. */
    private List<String> defaultFavorites() {
        Intent[] wanted = {
                new Intent(Intent.ACTION_DIAL),
                Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MESSAGING),
                Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER),
                new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA),
                Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_GALLERY),
        };
        List<String> keys = new ArrayList<>();
        for (Intent i : wanted) {
            ResolveInfo ri;
            try { ri = getPackageManager().resolveActivity(i, 0); } catch (Exception e) { continue; }
            if (ri == null || ri.activityInfo == null || "android".equals(ri.activityInfo.packageName)) continue;
            for (AppEntry e : allApps) {
                if (!e.workProfile && e.packageName().equals(ri.activityInfo.packageName) && !keys.contains(e.key)) {
                    keys.add(e.key);
                    break;
                }
            }
        }
        return keys;
    }

    private List<AppEntry> visibleApps() {
        Set<String> hidden = prefs.hidden();
        List<AppEntry> out = new ArrayList<>();
        for (AppEntry e : allApps) if (!hidden.contains(e.key)) out.add(e);
        return out;
    }

    private void applyFilter() {
        String q = search.getText().toString().trim();
        if (q.isEmpty()) {
            adapter.setItems(visibleApps(), true);
            webSearch.setVisibility(View.GONE);
        } else {
            // Bei der Suche auch ausgeblendete Apps finden.
            adapter.setItems(Search.filter(allApps, q), false);
            webSearch.setText("Im Web suchen: „" + q + "“");
            webSearch.setVisibility(View.VISIBLE);
        }
        grid.setFastScrollEnabled(q.isEmpty());
        grid.setSelection(0);
    }

    private View favoriteCell(final AppEntry e, int iconPx, boolean label) {
        View cell = AppAdapter.createCell(this, iconPx);
        AppAdapter.bind(cell, e, iconPx, label);
        cell.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { launch(e, v); }
        });
        cell.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) { showAppMenu(v, e, true); return true; }
        });
        return cell;
    }

    private void renderFavorites() {
        favoritesBox.removeAllViews();
        dock.removeAllViews();
        List<AppEntry> favs = new ArrayList<>();
        for (String k : prefs.favorites()) { AppEntry e = byKey.get(k); if (e != null) favs.add(e); }
        favoritesHint.setVisibility(favs.isEmpty() && !allApps.isEmpty() ? View.VISIBLE : View.GONE);

        // Leiste unten: Favorit 1, 2 | Apps-Knopf | Favorit 3, 4
        int dockIcon = dp(42);
        for (int slot = 0; slot < DOCK_SLOTS + 1; slot++) {
            if (slot == DOCK_SLOTS / 2) {
                FrameLayout wrap = new FrameLayout(this);
                FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.CENTER);
                wrap.addView(appsButton(), flp);
                wrap.setClipChildren(false);
                dock.addView(wrap, new LinearLayout.LayoutParams(0, -1, 1f));
                continue;
            }
            int idx = slot < DOCK_SLOTS / 2 ? slot : slot - 1;
            View v = idx < favs.size() ? favoriteCell(favs.get(idx), dockIcon, false) : new View(this);
            dock.addView(v, new LinearLayout.LayoutParams(0, -2, 1f));
        }

        int cols = prefs.columns();
        int iconPx = dp(prefs.iconSizeDp());
        LinearLayout row = null;
        int n = 0;
        for (int i = DOCK_SLOTS; i < favs.size(); i++, n++) {
            if (n % cols == 0) {
                row = new LinearLayout(this);
                favoritesBox.addView(row, new LinearLayout.LayoutParams(-1, -2));
            }
            row.addView(favoriteCell(favs.get(i), iconPx, prefs.showLabels()), new LinearLayout.LayoutParams(0, -2, 1f));
        }
        if (row != null) {
            for (int i = row.getChildCount(); i < cols; i++) row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        }
    }

    // ---------- Aktionen ----------

    private void launch(AppEntry e, View from) {
        try {
            repo.launch(e, from);
        } catch (Exception ex) {
            Toast.makeText(this, "„" + e.label() + "“ lässt sich nicht starten", Toast.LENGTH_SHORT).show();
            repo.reload();
        }
    }

    private void startSafe(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, "Keine passende App gefunden", Toast.LENGTH_SHORT).show();
        }
    }

    private void webSearch() {
        String q = search.getText().toString().trim();
        if (q.isEmpty()) return;
        Intent i = new Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, q);
        if (i.resolveActivity(getPackageManager()) == null) {
            i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://duckduckgo.com/?q=" + Uri.encode(q)));
        }
        startSafe(i);
    }

    private void expandNotifications() {
        try {
            Object sb = getSystemService("statusbar");
            Class.forName("android.app.StatusBarManager").getMethod("expandNotificationsPanel").invoke(sb);
        } catch (Exception ignored) {
            // Nicht jedes Gerät erlaubt das.
        }
    }

    private void showAppMenu(View anchor, final AppEntry e, final boolean onHome) {
        if (openMenu != null) openMenu.dismiss();
        final WfMenu m = new WfMenu(this);
        final List<String> favs = prefs.favorites();
        final boolean isHidden = prefs.hidden().contains(e.key);
        if (favs.contains(e.key)) {
            m.add(1, "Vom Startbildschirm entfernen");
            if (onHome && favs.indexOf(e.key) > 0) m.add(2, "← Nach vorne");
            if (onHome && favs.indexOf(e.key) < favs.size() - 1) m.add(3, "Nach hinten →");
        } else {
            m.add(4, "Zum Startbildschirm");
        }
        m.add(5, "Umbenennen");
        m.add(6, isHidden ? "Wieder anzeigen" : "In App-Liste ausblenden");
        m.add(7, "App-Info");
        m.add(8, "Deinstallieren");
        m.setOnDismiss(new Runnable() {
            @Override public void run() { if (openMenu == m) openMenu = null; }
        });
        openMenu = m;
        m.show(anchor, new WfMenu.OnPick() {
            @Override public void onPick(int id) {
                switch (id) {
                    case 1: favs.remove(e.key); prefs.setFavorites(favs); renderFavorites(); break;
                    case 2: Search.move(favs, e.key, -1); prefs.setFavorites(favs); renderFavorites(); break;
                    case 3: Search.move(favs, e.key, 1); prefs.setFavorites(favs); renderFavorites(); break;
                    case 4:
                        if (favs.size() >= MAX_FAVORITES) {
                            Toast.makeText(MainActivity.this, "Startbildschirm ist voll", Toast.LENGTH_SHORT).show();
                        } else {
                            favs.add(e.key); prefs.setFavorites(favs); renderFavorites();
                            Toast.makeText(MainActivity.this, "„" + e.label() + "“ hinzugefügt", Toast.LENGTH_SHORT).show();
                        }
                        break;
                    case 5: rename(e); break;
                    case 6: {
                        Set<String> h = prefs.hidden();
                        if (isHidden) h.remove(e.key); else h.add(e.key);
                        prefs.setHidden(h);
                        applyFilter();
                        break;
                    }
                    case 7: try { repo.showAppInfo(e); } catch (Exception ex) { /* ignorieren */ } break;
                    case 8: uninstall(e); break;
                }
            }
        });
    }

    private void uninstall(AppEntry e) {
        if (e.workProfile) {
            // Apps im Arbeitsprofil über die App-Info entfernen.
            try { repo.showAppInfo(e); } catch (Exception ignored) { }
            return;
        }
        startSafe(new Intent(Intent.ACTION_DELETE, Uri.fromParts("package", e.packageName(), null)));
    }

    private void rename(final AppEntry e) {
        final EditText in = new EditText(this);
        in.setSingleLine(true);
        in.setText(e.label());
        in.setSelectAllOnFocus(true);
        FrameLayout box = new FrameLayout(this);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(in);
        new AlertDialog.Builder(this)
                .setTitle("Umbenennen")
                .setMessage("Leer lassen für den Originalnamen „" + e.originalLabel + "“")
                .setView(box)
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        String v = in.getText().toString().trim();
                        prefs.setCustomLabel(e.key, v.equals(e.originalLabel) ? null : v);
                        repo.reload();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void showHomeMenu(View anchor) {
        new WfMenu(this)
                .add(1, "Hintergrundbild")
                .add(2, "Launcher-Einstellungen")
                .add(3, "Android-Einstellungen")
                .show(clockBox, new WfMenu.OnPick() {
                    @Override public void onPick(int id) {
                        if (id == 1) pickWallpaper();
                        else if (id == 2) showSettings();
                        else startSafe(new Intent(Settings.ACTION_SETTINGS));
                    }
                });
    }

    /** Eigenes Hintergrundbild wählen – schaltet dafür den Wunsch-Fabrik-Hintergrund ab. */
    private void pickWallpaper() {
        prefs.setWfBackground(false);
        applyLayoutPrefs();
        startSafe(Intent.createChooser(new Intent(Intent.ACTION_SET_WALLPAPER), "Hintergrundbild"));
    }

    private void showSettings() {
        final String[] sizes = {"klein", "mittel", "groß"};
        final int[] sizeDp = {44, 52, 60};
        final int sizeIdx = prefs.iconSizeDp() <= 44 ? 0 : prefs.iconSizeDp() >= 60 ? 2 : 1;
        String[] items = {
                "Hintergrund: " + (prefs.wfBackground() ? "Wunsch-Fabrik" : "eigenes Hintergrundbild"),
                "Spalten: " + prefs.columns(),
                "Symbolgröße: " + sizes[sizeIdx],
                "Uhr und Datum: " + (prefs.showClock() ? "an" : "aus"),
                "App-Namen: " + (prefs.showLabels() ? "an" : "aus"),
                "Tastatur beim Öffnen der App-Liste: " + (prefs.keyboardOnDrawer() ? "an" : "aus"),
                "Nach unten wischen öffnet Benachrichtigungen: " + (prefs.swipeDownNotifications() ? "an" : "aus"),
                "Ausgeblendete Apps (" + prefs.hidden().size() + ") …",
                "Hintergrundbild ändern …",
                "Als Standard-Startbildschirm festlegen …",
        };
        new AlertDialog.Builder(this)
                .setTitle("WF Launcher")
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        boolean reopen = true;
                        switch (which) {
                            case 0: prefs.setWfBackground(!prefs.wfBackground()); break;
                            case 1: prefs.setColumns(prefs.columns() >= 6 ? 3 : prefs.columns() + 1); break;
                            case 2: prefs.setIconSizeDp(sizeDp[(sizeIdx + 1) % 3]); break;
                            case 3: prefs.setShowClock(!prefs.showClock()); break;
                            case 4: prefs.setShowLabels(!prefs.showLabels()); break;
                            case 5: prefs.setKeyboardOnDrawer(!prefs.keyboardOnDrawer()); break;
                            case 6: prefs.setSwipeDownNotifications(!prefs.swipeDownNotifications()); break;
                            case 7: reopen = false; showHidden(); break;
                            case 8: reopen = false; pickWallpaper(); break;
                            case 9: reopen = false; openHomeSettings(); break;
                        }
                        applyLayoutPrefs();
                        if (reopen) showSettings();
                    }
                })
                .setNegativeButton("Fertig", null)
                .show();
    }

    private void openHomeSettings() {
        Intent i = new Intent(Settings.ACTION_HOME_SETTINGS);
        if (i.resolveActivity(getPackageManager()) == null) i = new Intent(Settings.ACTION_SETTINGS);
        startSafe(i);
    }

    private void showHidden() {
        final List<AppEntry> list = new ArrayList<>();
        Set<String> hidden = prefs.hidden();
        for (AppEntry e : allApps) if (hidden.contains(e.key)) list.add(e);
        if (list.isEmpty()) {
            Toast.makeText(this, "Keine Apps ausgeblendet", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] names = new String[list.size()];
        final boolean[] checked = new boolean[list.size()];
        for (int i = 0; i < list.size(); i++) { names[i] = list.get(i).label(); checked[i] = true; }
        new AlertDialog.Builder(this)
                .setTitle("Ausgeblendet (Haken weg = wieder anzeigen)")
                .setMultiChoiceItems(names, checked, new DialogInterface.OnMultiChoiceClickListener() {
                    @Override public void onClick(DialogInterface d, int which, boolean on) { checked[which] = on; }
                })
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        Set<String> h = prefs.hidden();
                        for (int i = 0; i < list.size(); i++) if (!checked[i]) h.remove(list.get(i).key);
                        prefs.setHidden(h);
                        applyFilter();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    // ---------- App-Liste öffnen/schließen ----------

    private void openDrawer(boolean keyboard) {
        if (drawerOpen) return;
        drawerOpen = true;
        drawer.animate().cancel();
        drawer.setVisibility(View.VISIBLE);
        drawer.setAlpha(0f);
        drawer.setTranslationY(dp(80));
        drawer.animate().alpha(1f).translationY(0).setDuration(200).setListener(null).start();
        home.animate().alpha(0f).setDuration(150).start();
        grid.setSelection(0);
        if (keyboard || prefs.keyboardOnDrawer()) {
            search.requestFocus();
            search.postDelayed(new Runnable() {
                @Override public void run() {
                    InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                    imm.showSoftInput(search, InputMethodManager.SHOW_IMPLICIT);
                }
            }, 120);
        }
    }

    private void closeDrawer(boolean animate) {
        hideKeyboard();
        if (openMenu != null) openMenu.dismiss();
        if (search.length() > 0) search.setText("");
        if (!drawerOpen) return;
        drawerOpen = false;
        home.animate().cancel();
        drawer.animate().cancel();
        if (!animate) {
            drawer.setVisibility(View.GONE);
            home.setAlpha(1f);
            return;
        }
        home.animate().alpha(1f).setDuration(200).start();
        drawer.animate().alpha(0f).translationY(dp(80)).setDuration(180).setListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator a) { if (!drawerOpen) drawer.setVisibility(View.GONE); }
        }).start();
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(search.getWindowToken(), 0);
        search.clearFocus();
    }

    @Override public void onBackPressed() {
        if (drawerOpen) closeDrawer(true);
        // Auf dem Startbildschirm macht Zurück nichts.
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Home-Taste gedrückt, während der Launcher schon vorne ist.
        if (Intent.ACTION_MAIN.equals(intent.getAction())) closeDrawer(hasWindowFocus());
    }

    @Override protected void onStop() {
        super.onStop();
        closeDrawer(false);
    }

    @Override public boolean dispatchTouchEvent(MotionEvent ev) {
        gestures.onTouchEvent(ev);
        return super.dispatchTouchEvent(ev);
    }

    private final class Swipes extends GestureDetector.SimpleOnGestureListener {
        @Override public boolean onFling(MotionEvent a, MotionEvent b, float vx, float vy) {
            if (a == null || b == null) return false;
            float dy = b.getY() - a.getY();
            float dx = b.getX() - a.getX();
            if (Math.abs(dy) < dp(60) || Math.abs(dy) < Math.abs(dx) * 1.5f || Math.abs(vy) < dp(400)) return false;
            if (!drawerOpen) {
                if (dy < 0) openDrawer(false);
                else if (prefs.swipeDownNotifications()) expandNotifications();
                return true;
            }
            if (dy > 0 && !grid.canScrollVertically(-1)) { closeDrawer(true); return true; }
            return false;
        }
    }
}
