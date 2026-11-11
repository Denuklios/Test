package app.fotogalerie.android;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.os.Environment;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Listet die Fotos des Handys (MediaStore). Die App liest die Bilder anschließend
 * über ihre content://-Adresse – sie werden nicht kopiert.
 */
@CapacitorPlugin(
    name = "DeviceGallery",
    permissions = {
        @Permission(alias = "photos", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "legacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class DeviceGalleryPlugin extends Plugin {

    private String alias() {
        return Build.VERSION.SDK_INT >= 33 ? "photos" : "legacy";
    }

    /** Auch "nur ausgewählte Fotos" (Android 14+) zählt als Zugriff */
    private boolean granted() {
        if (getPermissionState(alias()) == PermissionState.GRANTED) return true;
        return Build.VERSION.SDK_INT >= 34 &&
            ContextCompat.checkSelfPermission(getContext(), "android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkAccess(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (granted()) {
            checkAccess(call);
        } else {
            requestPermissionForAlias(alias(), call, "accessCallback");
        }
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        checkAccess(call);
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (!granted()) {
            call.reject("Kein Zugriff auf die Fotos");
            return;
        }
        getBridge().execute(() -> {
            JSArray arr = new JSArray();
            Uri collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.SIZE,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Images.Media.DATE_MODIFIED,
                MediaStore.Images.Media.MIME_TYPE
            };
            try (Cursor c = getContext().getContentResolver().query(collection, projection, null, null,
                MediaStore.Images.Media.DATE_TAKEN + " DESC")) {
                if (c != null) {
                    int iId = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                    int iName = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                    int iSize = c.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);
                    int iTaken = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
                    int iMod = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED);
                    int iMime = c.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
                    while (c.moveToNext()) {
                        long id = c.getLong(iId);
                        long taken = c.getLong(iTaken);
                        long modified = c.getLong(iMod);
                        JSObject o = new JSObject();
                        o.put("id", id);
                        o.put("uri", ContentUris.withAppendedId(collection, id).toString());
                        o.put("name", c.getString(iName));
                        o.put("size", c.getLong(iSize));
                        o.put("date", taken > 0 ? taken : modified * 1000);
                        o.put("modified", modified);
                        o.put("mime", c.getString(iMime));
                        arr.put(o);
                    }
                }
                JSObject r = new JSObject();
                r.put("photos", arr);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Fotos konnten nicht gelesen werden: " + e.getMessage());
            }
        });
    }

    /** Bild (Base64) in die Handy-Galerie speichern: Bilder/Fotogalerie */
    @PluginMethod
    public void saveImage(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "bild.jpg");
        String mime = call.getString("mime", "image/jpeg");
        if (data == null) { call.reject("Keine Daten"); return; }
        getBridge().execute(() -> {
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                v.put(MediaStore.Images.Media.MIME_TYPE, mime);
                if (Build.VERSION.SDK_INT >= 29) {
                    v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Fotogalerie");
                    v.put(MediaStore.Images.Media.IS_PENDING, 1);
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Fotogalerie");
                    dir.mkdirs();
                    v.put(MediaStore.Images.Media.DATA, new File(dir, name).getAbsolutePath());
                }
                Uri uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("Speichern nicht möglich");
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) { out.write(bytes); }
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.Images.Media.IS_PENDING, 0);
                    getContext().getContentResolver().update(uri, done, null, null);
                }
                JSObject r = new JSObject();
                r.put("uri", uri.toString());
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Speichern fehlgeschlagen: " + e.getMessage());
            }
        });
    }

    /** Bild über das Android-Teilen-Menü verschicken (WhatsApp, Mail …) */
    @PluginMethod
    public void shareImage(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "bild.jpg");
        String mime = call.getString("mime", "image/jpeg");
        if (data == null) { call.reject("Keine Daten"); return; }
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            dir.mkdirs();
            File f = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(Base64.decode(data, Base64.DEFAULT)); }
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
}
