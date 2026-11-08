package de.musterblick.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var list: LinearLayout
    private var photoUri: Uri? = null

    private val takePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) photoUri?.let { openEditor(it) }
    }
    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { openEditor(it) }
    }
    private val camPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) launchCamera() else Toast.makeText(this, "Ohne Kamera-Erlaubnis kein Foto möglich", Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Ui.initCv()
        PatternStore.ensureSample(this)
        val col = Ui.column(this)
        col.addView(Ui.title(this, "MusterBlick"))
        col.addView(Ui.label(this, "1. Marker-Blatt einmal ausdrucken (100 %).\n2. Gegenstand flach hinlegen, Marker-Blatt daneben, von oben fotografieren.\n3. Umriss prüfen, Nahtzugabe einstellen, speichern.\n4. Als PDF drucken oder mit dem Marker-Blatt direkt auf den Stoff projizieren.", 14f))
        col.addView(Ui.button(this, "Foto aufnehmen", true) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) launchCamera()
            else camPermission.launch(Manifest.permission.CAMERA)
        })
        col.addView(Ui.button(this, "Bild aus der Galerie") { pickImage.launch("image/*") })
        col.addView(Ui.button(this, "Marker-Blatt als PDF (zum Drucken)") {
            Executors.newSingleThreadExecutor().execute {
                val f = Pdf.markerSheet(this)
                runOnUiThread { Ui.sharePdf(this, f) }
            }
        })
        col.addView(Ui.title(this, "Meine Schnittmuster").apply { textSize = 18f; setPadding(0, Ui.dp(this@MainActivity, 20), 0, 0) })
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(list)
        setContentView(ScrollView(this).apply { addView(col) })
    }

    override fun onResume() {
        super.onResume()
        list.removeAllViews()
        val items = PatternStore.list(this)
        if (items.isEmpty()) list.addView(Ui.label(this, "Noch keine Schnittmuster gespeichert."))
        for (p in items) {
            list.addView(Ui.button(this, "%s  (%.0f x %.0f cm)".format(p.name, p.seamWidth / 10, p.seamHeight / 10)) {
                startActivity(Intent(this, PatternActivity::class.java).putExtra("id", p.id))
            })
        }
    }

    private fun launchCamera() {
        val dir = File(cacheDir, "photos").apply { mkdirs() }
        val f = File(dir, "foto_${System.currentTimeMillis()}.jpg")
        photoUri = FileProvider.getUriForFile(this, "$packageName.files", f)
        takePhoto.launch(photoUri!!)
    }

    private fun openEditor(uri: Uri) {
        startActivity(Intent(this, EditorActivity::class.java).setData(uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        photoUri?.let { outState.putString("photo", it.toString()) }
    }
    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        savedInstanceState.getString("photo")?.let { photoUri = Uri.parse(it) }
    }
}
