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
    /** Von der Kachel „Alle Apps“: App-Liste sofort öffnen. */
    public static final String ACTION_OPEN_APPS = "de.wunschfabrik.launcher.OPEN_APPS";
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
    private QuickPanel panel;
    private TextView defaultBanner;
    private NotesPanel notes;
    private OrdersCard orders;
    private InfoLine info;
    private TextView workChip;
    private LinearLayout workRow;
    private Folders folders;
    private android.content.BroadcastReceiver tick;
    private int lastWorkMode = -1;
    private boolean askedDefault;
    private boolean drawerOpen;
    private float density;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        density = getResources().getDisplayMetrics().density;
        prefs = new Prefs(this);
        folders = new Folders(prefs);
        setupWindow();
        buildUi();
        gestures = new GestureDetector(this, new Swipes());
        repo = new AppRepository(this, prefs, this);
        repo.start();
        if (ACTION_OPEN_APPS.equals(getIntent().getAction())) openDrawer(false);
    }

    @Override protected void onResume() {
        super.onResume();
        // Zurück aus WLAN-Fenster, Einstellungen usw.: Schalter neu lesen.
        if (panel.isOpen()) panel.refresh();
        orders.refresh(false);
        info.refresh();
        WorkMode.apply(this, prefs);
        refreshWorkMode(true);
        // Jede Minute: Arbeitsmodus-Anzeige aktualisieren (Wechsel um 16:00 usw.)
        tick = new android.content.BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) { refreshWorkMode(false); }
        };
        registerReceiver(tick, new android.content.IntentFilter(Intent.ACTION_TIME_TICK));
        boolean isDefault = isDefaultHome();
        defaultBanner.setVisibility(isDefault ? View.GONE : View.VISIBLE);
        // Beim ersten Öffnen einmal direkt fragen, solange noch ein anderer Startbildschirm Standard ist.
        if (!isDefault && !askedDefault) {
            askedDefault = true;
            root.postDelayed(new Runnable() { @Override public void run() { makeDefault(); } }, 600);
        }
    }

    @Override protected void onPause() {
        super.onPause();
        if (tick != null) { try { unregisterReceiver(tick); } catch (Exception ignored) { } tick = null; }
    }

    @Override public void onRequestPermissionsResult(int request, String[] perms, int[] results) {
        super.onRequestPermissionsResult(request, perms, results);
        if (request == 8) info.refresh();
    }

    private boolean isDefaultHome() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo ri = getPackageManager().resolveActivity(home, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
        return ri != null && ri.activityInfo != null && getPackageName().equals(ri.activityInfo.packageName);
    }

    /** Fragt per System-Fenster nach, sonst Einstellungsseite „Startbildschirm-App“. */
    private void makeDefault() {
        if (isDefaultHome()) return;
        if (!Compat.requestHomeRole(this, 7)) openHomeSettings();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 7 && !isDefaultHome()) {
            Toast.makeText(this, "Nicht festgelegt – über den Hinweis oben jederzeit erneut", Toast.LENGTH_LONG).show();
        }
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
                panel.setInsets(l, in.getSystemWindowInsetTop(), r, in.getSystemWindowInsetBottom());
                notes.setInsets(l, in.getSystemWindowInsetTop(), r, in.getSystemWindowInsetBottom());
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
        panel = new QuickPanel(this, new Runnable() {
            @Override public void run() { home.animate().alpha(1f).setDuration(200).start(); }
        });
        root.addView(panel.view(), new FrameLayout.LayoutParams(-1, -1));
        notes = new NotesPanel(this, prefs, new Runnable() {
            @Override public void run() { home.animate().alpha(1f).setDuration(200).start(); }
        });
        root.addView(notes.view(), new FrameLayout.LayoutParams(-1, -1));
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
        info = new InfoLine(this, prefs);
        clockBox.addView(info.view());
        homeContent.addView(clockBox);

        workChip = text(13, WfStyle.TEXT);
        workChip.setTypeface(WfStyle.bodyMedium(this));
        workChip.setPadding(dp(14), dp(7), dp(14), dp(7));
        workChip.setVisibility(View.GONE);
        workChip.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                WorkMode.toggle(MainActivity.this, prefs);
                refreshWorkMode(true);
                Toast.makeText(MainActivity.this, "Umgeschaltet bis zum nächsten planmäßigen Wechsel", Toast.LENGTH_SHORT).show();
            }
        });
        LinearLayout.LayoutParams wclp = new LinearLayout.LayoutParams(-2, -2);
        wclp.topMargin = dp(12);
        wclp.leftMargin = dp(4);
        homeContent.addView(workChip, wclp);

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
        blp.topMargin = dp(18);
        homeContent.addView(bar, blp);

        orders = new OrdersCard(this, prefs);
        LinearLayout.LayoutParams olp = new LinearLayout.LayoutParams(-1, -2);
        olp.topMargin = dp(12);
        homeContent.addView(orders.view(), olp);

        homeContent.addView(new View(this), new LinearLayout.LayoutParams(-1, 0, 1f));

        defaultBanner = text(14, Color.WHITE);
        defaultBanner.setTypeface(WfStyle.bodyMedium(this));
        defaultBanner.setText("WF Launcher als Standard-Startbildschirm festlegen  →");
        defaultBanner.setGravity(Gravity.CENTER);
        defaultBanner.setPadding(dp(16), dp(12), dp(16), dp(12));
        GradientDrawable bannerBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{WfStyle.P1, WfStyle.P2});
        bannerBg.setCornerRadius(dp(12));
        defaultBanner.setBackground(bannerBg);
        defaultBanner.setVisibility(View.GONE);
        defaultBanner.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { makeDefault(); }
        });
        LinearLayout.LayoutParams dblp = new LinearLayout.LayoutParams(-1, -2);
        dblp.bottomMargin = dp(16);
        homeContent.addView(defaultBanner, dblp);

        favoritesHint = text(14, WfStyle.MUTED);
        favoritesHint.setGravity(Gravity.CENTER);
        favoritesHint.setText("Lange auf eine App tippen → „Zum Startbildschirm“");
        favoritesHint.setPadding(0, 0, 0, dp(16));
        homeContent.addView(favoritesHint);

        workRow = new LinearLayout(this);
        workRow.setOrientation(LinearLayout.VERTICAL);
        homeContent.addView(workRow, new LinearLayout.LayoutParams(-1, -2));

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
        panel.setBackground(wf ? WfStyle.background(dm.widthPixels, dm.heightPixels) : new ColorDrawable(0xF5090909));
        notes.setBackground(wf ? WfStyle.background(dm.widthPixels, dm.heightPixels) : new ColorDrawable(0xF5090909));
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
        if (hideWorkNow()) hidden.addAll(prefs.workApps());
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

    private boolean hideWorkNow() {
        return WorkMode.current(this, prefs) == WorkMode.FREE && prefs.hideWorkAfterHours();
    }

    private View folderCell(final Folders.Folder f, int iconPx, boolean label) {
        View cell = AppAdapter.createCell(this, iconPx);
        List<Drawable> icons = new ArrayList<>();
        for (String k : f.apps) { AppEntry e = byKey.get(k); if (e != null) icons.add(e.icon); }
        android.widget.ImageView img = (android.widget.ImageView) ((LinearLayout) cell).getChildAt(0);
        img.setImageDrawable(new Folders.Icon(this, icons));
        TextView t = (TextView) ((LinearLayout) cell).getChildAt(1);
        t.setText(f.name);
        t.setVisibility(label ? View.VISIBLE : View.GONE);
        cell.setContentDescription("Ordner " + f.name);
        cell.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openFolder(f); }
        });
        cell.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) { showFolderMenu(v, f); return true; }
        });
        return cell;
    }

    private View homeCell(String key, int iconPx, boolean label) {
        Folders.Folder f = folders.get(key);
        if (f != null) return folderCell(f, iconPx, label);
        return favoriteCell(byKey.get(key), iconPx, label);
    }

    private void renderFavorites() {
        favoritesBox.removeAllViews();
        dock.removeAllViews();
        workRow.removeAllViews();
        Set<String> hideWork = hideWorkNow() ? prefs.workApps() : new java.util.HashSet<String>();
        List<String> favs = new ArrayList<>();
        for (String k : prefs.favorites()) {
            if (folders.get(k) != null || (byKey.containsKey(k) && !hideWork.contains(k))) favs.add(k);
        }
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
            View v = idx < favs.size() ? homeCell(favs.get(idx), dockIcon, false) : new View(this);
            dock.addView(v, new LinearLayout.LayoutParams(0, -2, 1f));
        }

        int cols = prefs.columns();
        int iconPx = dp(prefs.iconSizeDp());
        addRows(favoritesBox, favs.subList(Math.min(DOCK_SLOTS, favs.size()), favs.size()), cols, iconPx);

        // Arbeitszeit: Arbeits-Apps als eigene Reihe über den Favoriten
        if (WorkMode.current(this, prefs) == WorkMode.WORK) {
            List<String> work = new ArrayList<>();
            for (AppEntry e : allApps) if (prefs.workApps().contains(e.key) && !favs.contains(e.key)) work.add(e.key);
            if (!work.isEmpty()) {
                TextView eb = eyebrow("Arbeit");
                eb.setPadding(dp(8), 0, 0, dp(2));
                workRow.addView(eb);
                addRows(workRow, work, cols, iconPx);
                View sp = new View(this);
                workRow.addView(sp, new LinearLayout.LayoutParams(-1, dp(10)));
            }
        }
    }

    private void addRows(LinearLayout box, List<String> keys, int cols, int iconPx) {
        LinearLayout row = null;
        for (int n = 0; n < keys.size(); n++) {
            if (n % cols == 0) {
                row = new LinearLayout(this);
                box.addView(row, new LinearLayout.LayoutParams(-1, -2));
            }
            row.addView(homeCell(keys.get(n), iconPx, prefs.showLabels()), new LinearLayout.LayoutParams(0, -2, 1f));
        }
        if (row != null) {
            for (int i = row.getChildCount(); i < cols; i++) row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        }
    }

    // ---------- Arbeits- und Feierabend-Modus ----------

    private void refreshWorkMode(boolean force) {
        int mode = WorkMode.current(this, prefs);
        if (mode == WorkMode.OFF) {
            workChip.setVisibility(View.GONE);
        } else {
            long next = prefs.workOverride() != 0 && prefs.workOverrideUntil() > System.currentTimeMillis()
                    ? prefs.workOverrideUntil() : WorkMode.nextChange(prefs);
            String at = next == 0 ? "" : android.text.format.DateFormat.getTimeFormat(this).format(new java.util.Date(next));
            boolean work = mode == WorkMode.WORK;
            workChip.setText(work ? "●  Arbeitszeit" + (at.isEmpty() ? "" : " · bis " + at)
                    : "☾  Feierabend" + (at.isEmpty() ? "" : " · Arbeit ab " + at));
            GradientDrawable g = work
                    ? new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{WfStyle.P1, WfStyle.P2})
                    : new GradientDrawable();
            if (!work) { g.setColor(WfStyle.SURFACE3); g.setStroke(Math.max(1, dp(1)), WfStyle.LINE_STRONG); }
            g.setCornerRadius(dp(16));
            workChip.setBackground(g);
            workChip.setTextColor(work ? Color.WHITE : WfStyle.P3);
            workChip.setVisibility(View.VISIBLE);
        }
        if (force || mode != lastWorkMode) {
            lastWorkMode = mode;
            renderFavorites();
            applyFilter();
        }
    }

    private void showWorkSettings() {
        String days = daysText(prefs.workDays());
        String[] items = {
                "Modus: " + (prefs.workModeEnabled() ? "an" : "aus"),
                "Arbeitszeit: " + Logic.hhmm(prefs.workStart()) + "–" + Logic.hhmm(prefs.workEnd()) + " …",
                "Arbeitstage: " + days + " …",
                "Arbeits-Apps (" + prefs.workApps().size() + ") …",
                "Feierabend: Arbeits-Apps ausblenden: " + (prefs.hideWorkAfterHours() ? "an" : "aus"),
                "Feierabend: „Nicht stören“ einschalten: " + (prefs.dndAfterHours() ? "an" : "aus"),
        };
        new AlertDialog.Builder(this)
                .setTitle("Arbeit & Feierabend")
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        boolean reopen = true;
                        switch (which) {
                            case 0: prefs.setWorkModeEnabled(!prefs.workModeEnabled()); prefs.setWorkOverride(0, 0); break;
                            case 1: reopen = false; editWorkTimes(); break;
                            case 2: reopen = false; editWorkDays(); break;
                            case 3: reopen = false; editWorkApps(); break;
                            case 4: prefs.setHideWorkAfterHours(!prefs.hideWorkAfterHours()); break;
                            case 5: {
                                boolean on = !prefs.dndAfterHours();
                                prefs.setDndAfterHours(on);
                                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                                if (on && !nm.isNotificationPolicyAccessGranted()) {
                                    reopen = false;
                                    Toast.makeText(MainActivity.this, "Bitte „WF Launcher“ den Zugriff auf „Bitte nicht stören“ erlauben",
                                            Toast.LENGTH_LONG).show();
                                    startSafe(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
                                }
                                break;
                            }
                        }
                        WorkMode.apply(MainActivity.this, prefs);
                        refreshWorkMode(true);
                        if (reopen) showWorkSettings();
                    }
                })
                .setNegativeButton("Fertig", null)
                .show();
    }

    private static final String[] DAY_NAMES = {"Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"};

    private static String daysText(int mask) {
        if (mask == 0x1F) return "Mo–Fr";
        if (mask == 0x3F) return "Mo–Sa";
        if (mask == 0x7F) return "täglich";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 7; i++) if ((mask & (1 << i)) != 0) b.append(b.length() > 0 ? ", " : "").append(DAY_NAMES[i]);
        return b.length() == 0 ? "keine" : b.toString();
    }

    private void editWorkTimes() {
        LinearLayout box = new LinearLayout(this);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        final EditText from = new EditText(this), to = new EditText(this);
        from.setText(Logic.hhmm(prefs.workStart()));
        to.setText(Logic.hhmm(prefs.workEnd()));
        for (EditText e : new EditText[]{from, to}) {
            e.setInputType(InputType.TYPE_CLASS_DATETIME | InputType.TYPE_DATETIME_VARIATION_TIME);
            e.setSelectAllOnFocus(true);
            e.setGravity(Gravity.CENTER);
        }
        box.addView(from, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView dash = text(18, WfStyle.MUTED);
        dash.setText("  bis  ");
        box.addView(dash);
        box.addView(to, new LinearLayout.LayoutParams(0, -2, 1f));
        new AlertDialog.Builder(this)
                .setTitle("Arbeitszeit")
                .setView(box)
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        int a = Logic.parseHhmm(from.getText().toString()), b = Logic.parseHhmm(to.getText().toString());
                        if (a < 0 || b < 0 || a == b) {
                            Toast.makeText(MainActivity.this, "Bitte Uhrzeiten wie 08:00 und 16:00 eingeben", Toast.LENGTH_LONG).show();
                        } else {
                            prefs.setWorkTimes(a, b);
                            prefs.setWorkOverride(0, 0);
                            WorkMode.apply(MainActivity.this, prefs);
                            refreshWorkMode(true);
                        }
                        showWorkSettings();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void editWorkDays() {
        final boolean[] on = new boolean[7];
        for (int i = 0; i < 7; i++) on[i] = (prefs.workDays() & (1 << i)) != 0;
        String[] names = {"Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"};
        new AlertDialog.Builder(this)
                .setTitle("Arbeitstage")
                .setMultiChoiceItems(names, on, new DialogInterface.OnMultiChoiceClickListener() {
                    @Override public void onClick(DialogInterface d, int which, boolean v) { on[which] = v; }
                })
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        int mask = 0;
                        for (int i = 0; i < 7; i++) if (on[i]) mask |= 1 << i;
                        prefs.setWorkDays(mask);
                        prefs.setWorkOverride(0, 0);
                        WorkMode.apply(MainActivity.this, prefs);
                        refreshWorkMode(true);
                        showWorkSettings();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void editWorkApps() {
        final List<AppEntry> list = new ArrayList<>(allApps);
        final Set<String> chosen = prefs.workApps();
        String[] names = new String[list.size()];
        final boolean[] on = new boolean[list.size()];
        for (int i = 0; i < list.size(); i++) { names[i] = list.get(i).label(); on[i] = chosen.contains(list.get(i).key); }
        new AlertDialog.Builder(this)
                .setTitle("Arbeits-Apps")
                .setMultiChoiceItems(names, on, new DialogInterface.OnMultiChoiceClickListener() {
                    @Override public void onClick(DialogInterface d, int which, boolean v) { on[which] = v; }
                })
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        Set<String> s = new java.util.HashSet<>();
                        for (int i = 0; i < list.size(); i++) if (on[i]) s.add(list.get(i).key);
                        prefs.setWorkApps(s);
                        refreshWorkMode(true);
                        showWorkSettings();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    // ---------- Ordner ----------

    private void openFolder(final Folders.Folder f) {
        final android.app.Dialog dlg = new android.app.Dialog(this, android.R.style.Theme_Material_Dialog_NoActionBar);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackground(WfStyle.card(dp(22), density));
        box.setPadding(dp(14), dp(16), dp(14), dp(14));
        TextView title = text(26, WfStyle.TEXT);
        title.setTypeface(WfStyle.head(this));
        title.setText(f.name);
        title.setPadding(dp(8), 0, 0, dp(8));
        box.addView(title);
        final List<AppEntry> apps = new ArrayList<>();
        for (String k : f.apps) { AppEntry e = byKey.get(k); if (e != null) apps.add(e); }
        final AppAdapter a = new AppAdapter(this);
        a.iconPx = dp(prefs.iconSizeDp());
        a.showLabels = true;
        a.setItems(apps, false);
        GridView g = new GridView(this);
        g.setNumColumns(Math.min(4, Math.max(3, apps.size())));
        g.setAdapter(a);
        g.setSelector(new ColorDrawable(Color.TRANSPARENT));
        g.setVerticalSpacing(dp(6));
        g.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override public void onItemClick(AdapterView<?> p, View v, int pos, long id) { dlg.dismiss(); launch(apps.get(pos), v); }
        });
        g.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override public boolean onItemLongClick(AdapterView<?> p, View v, int pos, long id) {
                final AppEntry e = apps.get(pos);
                new WfMenu(MainActivity.this).add(1, "Aus Ordner nehmen").add(2, "App-Info")
                        .show(v, new WfMenu.OnPick() {
                            @Override public void onPick(int which) {
                                if (which == 2) { try { repo.showAppInfo(e); } catch (Exception ignored) { } return; }
                                dlg.dismiss();
                                removeFromFolder(f, e.key);
                            }
                        });
                return true;
            }
        });
        int rows = (apps.size() + 3) / 4;
        box.addView(g, new LinearLayout.LayoutParams(-1, Math.min(rows, 4) * (a.iconPx + dp(44))));
        dlg.setContentView(box);
        if (dlg.getWindow() != null) {
            dlg.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            dlg.getWindow().setLayout(getResources().getDisplayMetrics().widthPixels - dp(40), -2);
        }
        dlg.show();
    }

    private void removeFromFolder(Folders.Folder f, String appKey) {
        f.apps.remove(appKey);
        List<String> favs = prefs.favorites();
        int at = favs.indexOf(f.key());
        if (!favs.contains(appKey)) favs.add(at >= 0 ? at + 1 : favs.size(), appKey);
        if (f.apps.isEmpty()) { favs.remove(f.key()); folders.delete(f); } else folders.save();
        prefs.setFavorites(favs);
        renderFavorites();
    }

    private void showFolderMenu(View anchor, final Folders.Folder f) {
        final List<String> favs = prefs.favorites();
        final int idx = favs.indexOf(f.key());
        WfMenu m = new WfMenu(this).add(1, "Umbenennen");
        if (idx > 0) m.add(2, "← Nach vorne");
        if (idx >= 0 && idx < favs.size() - 1) m.add(3, "Nach hinten →");
        m.add(4, "Ordner auflösen");
        m.show(anchor, new WfMenu.OnPick() {
            @Override public void onPick(int id) {
                switch (id) {
                    case 1: askName("Ordner umbenennen", f.name, new NameResult() {
                        @Override public void done(String name) { f.name = name; folders.save(); renderFavorites(); }
                    }); break;
                    case 2: Search.move(favs, f.key(), -1); prefs.setFavorites(favs); renderFavorites(); break;
                    case 3: Search.move(favs, f.key(), 1); prefs.setFavorites(favs); renderFavorites(); break;
                    case 4: {
                        // Apps kommen an die Stelle des Ordners zurück auf den Startbildschirm.
                        int at = Math.max(0, favs.indexOf(f.key()));
                        favs.remove(f.key());
                        for (String k : f.apps) if (!favs.contains(k)) favs.add(Math.min(at++, favs.size()), k);
                        folders.delete(f);
                        prefs.setFavorites(favs);
                        renderFavorites();
                        break;
                    }
                }
            }
        });
    }

    private interface NameResult { void done(String name); }

    private void askName(String title, String preset, final NameResult r) {
        final EditText in = new EditText(this);
        in.setSingleLine(true);
        in.setText(preset);
        in.setSelectAllOnFocus(true);
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        FrameLayout box = new FrameLayout(this);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(in);
        new AlertDialog.Builder(this)
                .setTitle(title)
                .setView(box)
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        String v = in.getText().toString().trim();
                        r.done(v.isEmpty() ? "Ordner" : v);
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    /** App in einen bestehenden oder neuen Ordner legen. */
    private void addToFolder(View anchor, final AppEntry e) {
        final List<Folders.Folder> all = folders.all();
        WfMenu m = new WfMenu(this);
        for (int i = 0; i < all.size(); i++) m.add(100 + i, "📁  " + all.get(i).name);
        m.add(1, "＋  Neuer Ordner …");
        m.show(anchor, new WfMenu.OnPick() {
            @Override public void onPick(int id) {
                if (id == 1) {
                    askName("Neuer Ordner", "Werkstatt", new NameResult() {
                        @Override public void done(String name) {
                            Folders.Folder f = folders.create(name);
                            f.apps.add(e.key);
                            folders.save();
                            List<String> favs = prefs.favorites();
                            int at = favs.indexOf(e.key);
                            if (at >= 0) favs.set(at, f.key()); else favs.add(f.key());
                            prefs.setFavorites(favs);
                            renderFavorites();
                        }
                    });
                    return;
                }
                Folders.Folder f = all.get(id - 100);
                if (!f.apps.contains(e.key)) f.apps.add(e.key);
                folders.save();
                List<String> favs = prefs.favorites();
                favs.remove(e.key);
                prefs.setFavorites(favs);
                renderFavorites();
                Toast.makeText(MainActivity.this, "In „" + f.name + "“ gelegt", Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ---------- Startbildschirm-Inhalte ----------

    private void editDisplayLink() {
        final EditText in = new EditText(this);
        in.setHint("https://wunsch-fabrik.dk/auftraege/werkstatt/?t=…");
        in.setText(prefs.displayLink());
        in.setSelectAllOnFocus(true);
        FrameLayout box = new FrameLayout(this);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(in);
        new AlertDialog.Builder(this)
                .setTitle("Heute in der Werkstatt")
                .setMessage("In der Auftrags-App: Einstellungen → Werkstatt-Anzeige → „Neuen Link erzeugen“ (z. B. als „Handy“), "
                        + "Link kopieren und hier einfügen. Der Link am Werkstatt-PC bleibt gültig.\n\nLeer lassen = Karte ausblenden.")
                .setView(box)
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        String v = in.getText().toString().trim();
                        if (!v.isEmpty() && Logic.displayToken(v) == null) {
                            Toast.makeText(MainActivity.this, "Link unvollständig – bitte den ganzen Link kopieren", Toast.LENGTH_LONG).show();
                            return;
                        }
                        prefs.setDisplayLink(v);
                        orders.refresh(true);
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void editWeatherCity() {
        final EditText in = new EditText(this);
        in.setHint("z. B. Sønderborg");
        in.setText(prefs.weatherCity());
        in.setSingleLine(true);
        in.setSelectAllOnFocus(true);
        FrameLayout box = new FrameLayout(this);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(in);
        new AlertDialog.Builder(this)
                .setTitle("Ort fürs Wetter")
                .setMessage("Leer lassen = kein Wetter anzeigen.")
                .setView(box)
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        prefs.setWeatherCity(in.getText().toString());
                        info.refreshWeather(true);
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void toggleEvents() {
        boolean on = !prefs.showEvents();
        prefs.setShowEvents(on);
        if (on && !InfoLine.hasCalendarPermission(this)) {
            requestPermissions(new String[]{android.Manifest.permission.READ_CALENDAR}, 8);
        }
        info.refresh();
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
        m.add(9, "In Ordner legen …");
        if (prefs.workModeEnabled()) m.add(10, prefs.workApps().contains(e.key) ? "Keine Arbeits-App mehr" : "Als Arbeits-App markieren");
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
                    case 9: addToFolder(anchorFor(e), e); break;
                    case 10: {
                        Set<String> w = prefs.workApps();
                        if (!w.remove(e.key)) w.add(e.key);
                        prefs.setWorkApps(w);
                        refreshWorkMode(true);
                        break;
                    }
                }
            }
        });
    }

    /** Das Menü schließt sich vor dem Ordner-Menü; als Anker reicht dann ein fester Punkt oben. */
    private View anchorFor(AppEntry e) { return drawerOpen ? search : menuAnchor(); }

    private View menuAnchor() { return clockBox.getVisibility() == View.VISIBLE ? clockBox : homeContent; }

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
                .add(4, "WF-Schnellbereich")
                .add(5, "Schnellnotiz")
                .add(1, "Hintergrundbild")
                .add(2, "Launcher-Einstellungen")
                .add(3, "Android-Einstellungen")
                .show(menuAnchor(), new WfMenu.OnPick() {
                    @Override public void onPick(int id) {
                        if (id == 4) openPanel();
                        else if (id == 5) openNotes();
                        else if (id == 1) pickWallpaper();
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
                "Heute in der Werkstatt: " + (Logic.displayToken(prefs.displayLink()) != null ? "Link eingetragen" : "aus") + " …",
                "Termine unter der Uhr: " + (prefs.showEvents() ? "an" : "aus"),
                "Wetter: " + (prefs.weatherCity().isEmpty() ? "aus" : prefs.weatherCity()) + " …",
                "Arbeit & Feierabend: " + (prefs.workModeEnabled() ? "an" : "aus") + " …",
                "Hintergrund: " + (prefs.wfBackground() ? "Wunsch-Fabrik" : "eigenes Hintergrundbild"),
                "Spalten: " + prefs.columns(),
                "Symbolgröße: " + sizes[sizeIdx],
                "Uhr und Datum: " + (prefs.showClock() ? "an" : "aus"),
                "App-Namen: " + (prefs.showLabels() ? "an" : "aus"),
                "Tastatur beim Öffnen der App-Liste: " + (prefs.keyboardOnDrawer() ? "an" : "aus"),
                "Nach unten wischen: " + SWIPE_NAMES[prefs.swipeDown()],
                "Ausgeblendete Apps (" + prefs.hidden().size() + ") …",
                "Hintergrundbild ändern …",
                "Als Standard-Startbildschirm festlegen …",
                "WF-Hintergrundbild fürs ganze Handy (lila Systemfarben) …",
                "WF-Kacheln im Android-Schnellzugriff hinzufügen …",
                "Zugriff auf Benachrichtigungen …",
        };
        new AlertDialog.Builder(this)
                .setTitle("WF Launcher")
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        boolean reopen = true;
                        switch (which) {
                            case 0: reopen = false; editDisplayLink(); break;
                            case 1: toggleEvents(); break;
                            case 2: reopen = false; editWeatherCity(); break;
                            case 3: reopen = false; showWorkSettings(); break;
                            case 4: prefs.setWfBackground(!prefs.wfBackground()); break;
                            case 5: prefs.setColumns(prefs.columns() >= 6 ? 3 : prefs.columns() + 1); break;
                            case 6: prefs.setIconSizeDp(sizeDp[(sizeIdx + 1) % 3]); break;
                            case 7: prefs.setShowClock(!prefs.showClock()); break;
                            case 8: prefs.setShowLabels(!prefs.showLabels()); break;
                            case 9: prefs.setKeyboardOnDrawer(!prefs.keyboardOnDrawer()); break;
                            case 10: prefs.setSwipeDown((prefs.swipeDown() + 1) % SWIPE_NAMES.length); break;
                            case 11: reopen = false; showHidden(); break;
                            case 12: reopen = false; pickWallpaper(); break;
                            case 13: reopen = false; makeDefault(); break;
                            case 14: reopen = false; confirmSystemWallpaper(); break;
                            case 15: reopen = false; addTiles(); break;
                            case 16: reopen = false; startSafe(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")); break;
                        }
                        applyLayoutPrefs();
                        if (reopen) showSettings();
                    }
                })
                .setNegativeButton("Fertig", null)
                .show();
    }

    private static final String[] SWIPE_NAMES = {"WF-Schnellbereich", "Android-Bereich", "nichts"};

    private void openNotes() {
        if (notes.isOpen()) return;
        if (drawerOpen) closeDrawer(false);
        if (panel.isOpen()) panel.close(false);
        if (openMenu != null) openMenu.dismiss();
        home.animate().alpha(0f).setDuration(150).start();
        notes.open();
    }

    private void openPanel() {
        if (panel.isOpen()) return;
        if (drawerOpen) closeDrawer(false);
        if (openMenu != null) openMenu.dismiss();
        home.animate().alpha(0f).setDuration(150).start();
        panel.open();
    }

    private void confirmSystemWallpaper() {
        new AlertDialog.Builder(this)
                .setTitle("WF-Hintergrundbild setzen?")
                .setMessage("Setzt ein schwarz-violettes Bild mit WF-Logo für Startbildschirm und Sperrbildschirm.\n\n"
                        + "Nothing OS färbt danach Schnellzugriff, Einstellungen und Tastatur passend ein. Falls nicht: "
                        + "Einstellungen → Personalisierung (bzw. Hintergrund & Stil) → Farben → „Hintergrundfarben“ wählen.")
                .setPositiveButton("Setzen", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) { applySystemWallpaper(); }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void applySystemWallpaper() {
        Toast.makeText(this, "Hintergrundbild wird gesetzt …", Toast.LENGTH_SHORT).show();
        final android.os.Handler h = new android.os.Handler();
        new Thread(new Runnable() {
            @Override public void run() {
                boolean ok;
                try {
                    android.graphics.Bitmap bmp = WfWallpaper.create(MainActivity.this);
                    Compat.setWallpaper(MainActivity.this, bmp);
                    ok = true;
                } catch (Exception e) {
                    ok = false;
                }
                final boolean done = ok;
                h.post(new Runnable() {
                    @Override public void run() {
                        if (done) {
                            // Launcher zeigt jetzt das Systembild, damit Startbildschirm und System gleich aussehen.
                            prefs.setWfBackground(false);
                            applyLayoutPrefs();
                        }
                        Toast.makeText(MainActivity.this, done ? "Fertig – Systemfarben passen sich in ein paar Sekunden an"
                                : "Hintergrundbild konnte nicht gesetzt werden", Toast.LENGTH_LONG).show();
                    }
                });
            }
        }, "wallpaper").start();
    }

    /** Ab Android 13 fragt das System je Kachel „Hinzufügen?“, sonst Anleitung. */
    private void addTiles() {
        addTile(0);
    }

    private void addTile(final int i) {
        if (i >= Tiles.ALL.length) {
            Toast.makeText(this, "Kacheln fertig – zum Verschieben im Schnellzugriff auf den Stift tippen", Toast.LENGTH_LONG).show();
            return;
        }
        boolean asked = Compat.requestAddTile(this, Tiles.component(this, i), Tiles.LABELS[i], Tiles.ICONS[i], new Compat.Result() {
            @Override public void done(boolean added) { addTile(i + 1); }
        });
        if (!asked) {
            new AlertDialog.Builder(this)
                    .setTitle("WF-Kacheln hinzufügen")
                    .setMessage("Von oben zweimal herunterziehen → Stift (Bearbeiten) → unten „Aufträge“, „Neuer Auftrag“, "
                            + "„WF-Kalender“ und „Alle Apps“ nach oben ziehen.")
                    .setPositiveButton("OK", null)
                    .show();
        }
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
        if (panel.isOpen()) panel.close(true);
        else if (notes.isOpen()) notes.close(true);
        else if (drawerOpen) closeDrawer(true);
        // Auf dem Startbildschirm macht Zurück nichts.
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Home-Taste gedrückt, während der Launcher schon vorne ist.
        if (ACTION_OPEN_APPS.equals(intent.getAction())) {
            panel.close(false);
            openDrawer(false);
        } else if (Intent.ACTION_MAIN.equals(intent.getAction())) {
            panel.close(hasWindowFocus());
            notes.close(hasWindowFocus());
            closeDrawer(hasWindowFocus());
        }
    }

    @Override protected void onStop() {
        super.onStop();
        closeDrawer(false);
        panel.close(false);
        notes.close(false);
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
            // Waagerecht: nach links = Notizen öffnen, nach rechts = Notizen schließen
            if (Math.abs(dx) > dp(80) && Math.abs(dx) > Math.abs(dy) * 1.5f && Math.abs(vx) > dp(400)) {
                if (notes.isOpen()) { if (dx > 0) { notes.close(true); return true; } return false; }
                if (!drawerOpen && !panel.isOpen() && dx < 0) { openNotes(); return true; }
                return false;
            }
            if (notes.isOpen()) return false;
            if (Math.abs(dy) < dp(60) || Math.abs(dy) < Math.abs(dx) * 1.5f || Math.abs(vy) < dp(400)) return false;
            if (panel.isOpen()) {
                if (dy < 0 && panel.atBottom()) { panel.close(true); return true; }
                return false;
            }
            if (!drawerOpen) {
                if (dy < 0) openDrawer(false);
                else if (prefs.swipeDown() == Prefs.SWIPE_WF_PANEL) openPanel();
                else if (prefs.swipeDown() == Prefs.SWIPE_SYSTEM) expandNotifications();
                return true;
            }
            if (dy > 0 && !grid.canScrollVertically(-1)) { closeDrawer(true); return true; }
            return false;
        }
    }
}
