package de.musterblick.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.ViewGroup
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
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(Ui.header(this, "MusterBlick", "Vom Foto zum Schnittmuster – direkt auf den Stoff", back = false))
        val col = Ui.column(this)

        val newCard = Ui.card(this); val nb = Ui.cardBody(this, newCard)
        nb.addView(Ui.h2(this, "Neues Schnittmuster"))
        nb.addView(Ui.body(this, "Fotografiere den Gegenstand oder nimm ein Bild aus der Galerie. Das Hauptmotiv in der Mitte wird automatisch erkannt."))
        val r = Ui.row(this)
        r.addView(Ui.weighted(Ui.button(this, "Foto", Ui.Kind.PRIMARY, R.drawable.ic_camera) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) launchCamera()
            else camPermission.launch(Manifest.permission.CAMERA)
        }))
        r.addView(Ui.weighted(Ui.button(this, "Galerie", Ui.Kind.TONAL, R.drawable.ic_image) { pickImage.launch("image/*") }, gap = 0))
        nb.addView(r)
        col.addView(newCard)

        val mk = Ui.card(this); val mb = Ui.cardBody(this, mk)
        mb.addView(Ui.h2(this, "Marker-Blatt"))
        mb.addView(Ui.body(this, "Einmal in 100 % ausdrucken. Liegt es beim Foto neben dem Gegenstand, kennt die App die echte Größe. Auf dem Stoff hält es das projizierte Muster fest."))
        mb.addView(Ui.button(this, "Marker-Blatt drucken", Ui.Kind.OUTLINE, R.drawable.ic_print) {
            Executors.newSingleThreadExecutor().execute {
                val f = Pdf.markerSheet(this)
                runOnUiThread { Ui.sharePdf(this, f) }
            }
        })
        col.addView(mk, Ui.lp(top = Ui.dp(this, 12)))

        col.addView(Ui.section(this, "Meine Schnittmuster"))
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(list)
        root.addView(ScrollView(this).apply { addView(col) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        list.removeAllViews()
        val items = PatternStore.list(this)
        if (items.isEmpty()) list.addView(Ui.body(this, "Noch keine Schnittmuster gespeichert."))
        var row: LinearLayout? = null
        items.forEachIndexed { i, p ->
            if (i % 2 == 0) { row = Ui.row(this).apply { weightSum = 2f }; list.addView(row, Ui.lp(top = if (i == 0) 0 else Ui.dp(this, 10))) }
            val card = Ui.card(this).apply {
                setOnClickListener { startActivity(Intent(this@MainActivity, PatternActivity::class.java).putExtra("id", p.id)) }
            }
            val b = Ui.column(this, 10)
            b.addView(PatternView(this, p, thumb = true), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 120)))
            b.addView(android.widget.TextView(this).apply { text = p.name; setTextColor(Ui.INK); textSize = 14.5f; maxLines = 2; setPadding(0, Ui.dp(context, 8), 0, 0) })
            b.addView(android.widget.TextView(this).apply { text = "%.0f × %.0f cm".format(p.seamWidth / 10, p.seamHeight / 10); setTextColor(Ui.MUTED); textSize = 13f })
            card.addView(b)
            row!!.addView(card, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = if (i % 2 == 0) Ui.dp(this@MainActivity, 10) else 0 })
        }
        if (items.size % 2 == 1) row?.addView(android.view.View(this), LinearLayout.LayoutParams(0, 1, 1f))
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
