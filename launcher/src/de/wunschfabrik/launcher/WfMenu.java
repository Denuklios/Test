package de.wunschfabrik.launcher;

import android.content.Context;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ListPopupWindow;
import android.widget.PopupWindow;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** Aufklappmenü als Karte im Wunsch-Fabrik-Stil (statt PopupMenu). */
public final class WfMenu {
    public interface OnPick { void onPick(int id); }

    private final Context ctx;
    private final List<String> labels = new ArrayList<>();
    private final List<Integer> ids = new ArrayList<>();
    private ListPopupWindow popup;
    private Runnable onDismiss;

    public WfMenu(Context c) { ctx = c; }

    public WfMenu add(int id, String label) { ids.add(id); labels.add(label); return this; }

    public void setOnDismiss(Runnable r) { onDismiss = r; }

    public void dismiss() { if (popup != null) popup.dismiss(); }

    public void show(View anchor, final OnPick pick) {
        final float d = ctx.getResources().getDisplayMetrics().density;
        ArrayAdapter<String> a = new ArrayAdapter<String>(ctx, android.R.layout.simple_list_item_1, labels) {
            @Override public View getView(int pos, View convert, ViewGroup parent) {
                TextView t = (TextView) super.getView(pos, convert, parent);
                t.setTextColor(WfStyle.TEXT);
                t.setTypeface(WfStyle.body(ctx));
                t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
                t.setPadding((int) (18 * d), 0, (int) (18 * d), 0);
                t.setMinHeight((int) (46 * d));
                return t;
            }
        };
        popup = new ListPopupWindow(ctx);
        popup.setAdapter(a);
        popup.setAnchorView(anchor);
        popup.setModal(true);
        popup.setWidth((int) (250 * d));
        popup.setBackgroundDrawable(WfStyle.card(14 * d, d));
        popup.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override public void onItemClick(AdapterView<?> p, View v, int pos, long id) {
                popup.dismiss();
                pick.onPick(ids.get(pos));
            }
        });
        popup.setOnDismissListener(new PopupWindow.OnDismissListener() {
            @Override public void onDismiss() { if (onDismiss != null) onDismiss.run(); }
        });
        popup.show();
    }
}
