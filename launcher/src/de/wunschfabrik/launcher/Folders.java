package de.wunschfabrik.launcher;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * App-Ordner auf dem Startbildschirm. In der Favoritenliste steht ein Ordner als „folder:ID“.
 */
public final class Folders {
    public static final String PREFIX = "folder:";

    public static final class Folder {
        public final String id;
        public String name;
        public final List<String> apps = new ArrayList<>();
        Folder(String id, String name) { this.id = id; this.name = name; }
        public String key() { return PREFIX + id; }
    }

    private final Prefs prefs;
    private final Map<String, Folder> folders = new LinkedHashMap<>();

    public Folders(Prefs p) {
        prefs = p;
        try {
            JSONObject o = new JSONObject(p.foldersJson());
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String id = it.next();
                JSONObject f = o.getJSONObject(id);
                Folder folder = new Folder(id, f.optString("name", "Ordner"));
                JSONArray a = f.optJSONArray("apps");
                if (a != null) for (int i = 0; i < a.length(); i++) folder.apps.add(a.getString(i));
                folders.put(id, folder);
            }
        } catch (Exception ignored) { }
    }

    public static boolean isFolderKey(String key) { return key != null && key.startsWith(PREFIX); }

    public Folder get(String key) { return isFolderKey(key) ? folders.get(key.substring(PREFIX.length())) : null; }

    public List<Folder> all() { return new ArrayList<>(folders.values()); }

    public Folder create(String name) {
        String id = Long.toString(System.currentTimeMillis(), 36);
        Folder f = new Folder(id, name == null || name.trim().isEmpty() ? "Ordner" : name.trim());
        folders.put(id, f);
        save();
        return f;
    }

    public void delete(Folder f) { folders.remove(f.id); save(); }

    public void save() {
        try {
            JSONObject o = new JSONObject();
            for (Folder f : folders.values()) {
                JSONObject j = new JSONObject();
                j.put("name", f.name);
                j.put("apps", new JSONArray(f.apps));
                o.put(f.id, j);
            }
            prefs.setFoldersJson(o.toString());
        } catch (Exception ignored) { }
    }

    /** Ordnersymbol: violett umrandetes Quadrat mit bis zu 4 Mini-Symbolen. */
    public static final class Icon extends Drawable {
        private final List<Drawable> icons;
        private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float density;

        public Icon(Context c, List<Drawable> icons) {
            this.icons = icons;
            density = c.getResources().getDisplayMetrics().density;
            bg.setColor(WfStyle.SURFACE3);
            line.setColor(WfStyle.LINE_STRONG);
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(Math.max(1, density));
        }

        @Override public void draw(Canvas c) {
            Rect b = getBounds();
            RectF r = new RectF(b);
            r.inset(line.getStrokeWidth(), line.getStrokeWidth());
            float rad = b.width() * 0.26f;
            c.drawRoundRect(r, rad, rad, bg);
            c.drawRoundRect(r, rad, rad, line);
            float pad = b.width() * 0.14f, gap = b.width() * 0.06f;
            float cell = (b.width() - 2 * pad - gap) / 2f;
            for (int i = 0; i < Math.min(4, icons.size()); i++) {
                Drawable d = icons.get(i);
                if (d == null) continue;
                int col = i % 2, row = i / 2;
                int l = (int) (b.left + pad + col * (cell + gap)), t = (int) (b.top + pad + row * (cell + gap));
                Rect old = d.copyBounds();
                d.setBounds(l, t, (int) (l + cell), (int) (t + cell));
                d.draw(c);
                d.setBounds(old);
            }
        }

        @Override public void setAlpha(int a) { bg.setAlpha(a); }
        @Override public void setColorFilter(ColorFilter f) { }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
