package de.wunschfabrik.launcher;

import android.content.Context;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SectionIndexer;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** Raster-Zellen (Symbol + Name) für App-Liste und Startbildschirm, mit Buchstaben-Schnellscrollen. */
public final class AppAdapter extends BaseAdapter implements SectionIndexer {
    private final Context ctx;
    private List<AppEntry> items = new ArrayList<>();
    private String[] sections = new String[0];
    private int[] sectionStart = new int[0];
    int iconPx;
    boolean showLabels = true;

    public AppAdapter(Context c) { ctx = c; }

    public void setItems(List<AppEntry> list, boolean indexed) {
        items = list;
        List<String> secs = new ArrayList<>();
        List<Integer> starts = new ArrayList<>();
        if (indexed) {
            for (int i = 0; i < list.size(); i++) {
                String l = Search.normalize(list.get(i).label());
                String s = l.isEmpty() ? "#" : l.substring(0, 1).toUpperCase();
                if (!Character.isLetter(s.charAt(0))) s = "#";
                if (secs.isEmpty() || !secs.get(secs.size() - 1).equals(s)) { secs.add(s); starts.add(i); }
            }
        }
        sections = secs.toArray(new String[0]);
        sectionStart = new int[starts.size()];
        for (int i = 0; i < starts.size(); i++) sectionStart[i] = starts.get(i);
        notifyDataSetChanged();
    }

    @Override public int getCount() { return items.size(); }
    @Override public AppEntry getItem(int p) { return items.get(p); }
    @Override public long getItemId(int p) { return p; }

    @Override public View getView(int pos, View convert, ViewGroup parent) {
        View v = convert != null ? convert : createCell(ctx, iconPx);
        bind(v, items.get(pos), iconPx, showLabels);
        return v;
    }

    static View createCell(Context c, int iconPx) {
        float d = c.getResources().getDisplayMetrics().density;
        LinearLayout cell = new LinearLayout(c);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setGravity(Gravity.CENTER_HORIZONTAL);
        int p = (int) (6 * d);
        cell.setPadding(p, p + p / 2, p, p);
        TypedValue tv = new TypedValue();
        c.getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true);
        cell.setBackgroundResource(tv.resourceId);
        ImageView img = new ImageView(c);
        img.setScaleType(ImageView.ScaleType.FIT_CENTER);
        cell.addView(img, new LinearLayout.LayoutParams(iconPx, iconPx));
        TextView t = new TextView(c);
        t.setTextColor(WfStyle.TEXT);
        t.setTypeface(WfStyle.body(c));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setShadowLayer(4 * d, 0, d, 0xAA000000);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = (int) (5 * d);
        cell.addView(t, lp);
        return cell;
    }

    static void bind(View cell, AppEntry e, int iconPx, boolean showLabels) {
        LinearLayout l = (LinearLayout) cell;
        ImageView img = (ImageView) l.getChildAt(0);
        TextView t = (TextView) l.getChildAt(1);
        ViewGroup.LayoutParams lp = img.getLayoutParams();
        if (lp.width != iconPx) { lp.width = iconPx; lp.height = iconPx; img.setLayoutParams(lp); }
        if (e.icon != null) img.setImageDrawable(e.icon);
        else img.setImageResource(android.R.drawable.sym_def_app_icon);
        t.setText(e.label());
        t.setVisibility(showLabels ? View.VISIBLE : View.GONE);
        cell.setContentDescription(e.label());
    }

    @Override public Object[] getSections() { return sections; }
    @Override public int getPositionForSection(int s) {
        if (sectionStart.length == 0) return 0;
        return sectionStart[Math.max(0, Math.min(s, sectionStart.length - 1))];
    }
    @Override public int getSectionForPosition(int pos) {
        int s = 0;
        for (int i = 0; i < sectionStart.length; i++) if (sectionStart[i] <= pos) s = i;
        return s;
    }
}
