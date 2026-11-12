package app.kamera.android;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Speichert Fotos und Videos in die Handy-Galerie (DCIM/Kamera Pro) und teilt sie.
 * Große Dateien kommen in Stücken (Base64) an und werden erst in eine Zwischendatei geschrieben.
 */
@CapacitorPlugin(name = "Media")
public class MediaPlugin extends Plugin {

    private File tmpFile(String id) {
        File dir = new File(getContext().getCacheDir(), "uploads");
        dir.mkdirs();
        return new File(dir, id.replaceAll("[^A-Za-z0-9_-]", "_"));
    }

    @PluginMethod
    public void append(PluginCall call) {
        String id = call.getString("id");
        String data = call.getString("data");
        boolean first = call.getBoolean("first", false);
        if (id == null || data == null) { call.reject("Keine Daten"); return; }
        getBridge().execute(() -> {
            try (FileOutputStream out = new FileOutputStream(tmpFile(id), !first)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
                call.resolve();
            } catch (Exception e) {
                call.reject("Schreiben fehlgeschlagen: " + e.getMessage());
            }
        });
    }

    /** Zwischendatei in die Galerie übernehmen */
    @PluginMethod
    public void commit(PluginCall call) {
        String id = call.getString("id");
        String name = call.getString("name", "bild.jpg");
        String mime = call.getString("mime", "image/jpeg");
        if (id == null) { call.reject("Keine Datei"); return; }
        getBridge().execute(() -> {
            File f = tmpFile(id);
            try {
                boolean video = mime.startsWith("video/");
                Uri collection = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                if (Build.VERSION.SDK_INT >= 29) {
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/Kamera Pro");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "Kamera Pro");
                    dir.mkdirs();
                    v.put(MediaStore.MediaColumns.DATA, new File(dir, name).getAbsolutePath());
                }
                Uri uri = getContext().getContentResolver().insert(collection, v);
                if (uri == null) throw new Exception("Speichern nicht möglich");
                try (InputStream in = new FileInputStream(f); OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(uri, done, null, null);
                }
                f.delete();
                JSObject r = new JSObject();
                r.put("uri", uri.toString());
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Speichern fehlgeschlagen: " + e.getMessage());
            }
        });
    }

    /** Zwischendatei über das Android-Teilen-Menü verschicken */
    @PluginMethod
    public void share(PluginCall call) {
        String id = call.getString("id");
        String name = call.getString("name", "bild.jpg");
        String mime = call.getString("mime", "image/jpeg");
        try {
            File src = tmpFile(id);
            File dir = new File(getContext().getCacheDir(), "share");
            dir.mkdirs();
            File f = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            if (f.exists()) f.delete();
            if (!src.renameTo(f)) throw new Exception("Datei fehlt");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Teilen");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Teilen fehlgeschlagen: " + e.getMessage());
        }
    }

    /** Link (z. B. aus einem QR-Code) im Browser bzw. passender App öffnen */
    @PluginMethod
    public void openUrl(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url")));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Öffnen nicht möglich");
        }
    }
}
