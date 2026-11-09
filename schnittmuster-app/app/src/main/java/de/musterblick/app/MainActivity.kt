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
        val col = Ui.column(this)
        val d = { v: Int -> Ui.dp(this, v) }

        // hero: shop logo in a gold-framed card
        val hero = com.google.android.material.card.MaterialCardView(this).apply {
            radius = Ui.dpf(context, 24f); cardElevation = Ui.dpf(context, 3f)
            strokeColor = Ui.GOLD; strokeWidth = d(2); setCardBackgroundColor(Ui.CARD)
        }
        hero.addView(android.widget.ImageView(this).apply {
            setImageResource(R.drawable.julekontor_logo); adjustViewBounds = true
            scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
            contentDescription = "Julekontor – Danmarks gammeldags julebutik"
        })
        col.addView(hero)
        col.addView(android.widget.TextView(this).apply {
            text = "Schnittwerkstatt"; textSize = 30f; setTextColor(Ui.BERRY)
            typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.BOLD)
            gravity = android.view.Gravity.CENTER; setPadding(0, d(18), 0, 0)
        })
        col.addView(android.widget.TextView(this).apply {
            text = "Vom Foto zum Schnittmuster – und direkt auf den Stoff."
            textSize = 15f; setTextColor(Ui.MUTED); gravity = android.view.Gravity.CENTER; setPadding(d(12), d(4), d(12), d(6))
        })
        // ornament line
        col.addView(android.widget.TextView(this).apply {
            text = "✦  ✦  ✦"; textSize = 12f; setTextColor(Ui.GOLD); gravity = android.view.Gravity.CENTER; setPadding(0, 0, 0, d(14))
        })

        fun tileRow(a: android.view.View, b: android.view.View) = Ui.row(this).apply {
            addView(a, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { marginEnd = d(6) })
            addView(b, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { marginStart = d(6) })
        }
        val cream = android.graphics.Color.rgb(255, 247, 236)
        col.addView(tileRow(
            Ui.tile(this, "Foto aufnehmen", "Gegenstand fotografieren", R.drawable.ic_camera, Ui.BERRY, cream, Ui.RED_DARK) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) launchCamera()
                else camPermission.launch(Manifest.permission.CAMERA)
            },
            Ui.tile(this, "Aus Galerie", "Bild oder Screenshot wählen", R.drawable.ic_image, Ui.PINE, cream, android.graphics.Color.rgb(31, 66, 43)) {
                pickImage.launch("image/*")
            },
        ))
        col.addView(tileRow(
            Ui.tile(this, "Marker drucken", "A4, Quadrat und Streifen", R.drawable.ic_print, Ui.CARD, Ui.INK, Ui.GOLD_SOFT) {
                Executors.newSingleThreadExecutor().execute {
                    val f = Pdf.markerSheet(this)
                    runOnUiThread { Ui.sharePdf(this, f) }
                }
            },
            Ui.tile(this, "So geht's", "In vier Schritten zum Muster", R.drawable.ic_help, Ui.CARD, Ui.INK, Ui.GOLD_SOFT) { showHelp() },
        ), Ui.lp(top = d(12)))

        col.addView(Ui.section(this, "Meine Schnittmuster"))
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(list)
        col.addView(android.widget.TextView(this).apply {
            text = "Julekontor · Danmarks gammeldags julebutik"; textSize = 12.5f; setTextColor(Ui.GOLD)
            typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.ITALIC)
            gravity = android.view.Gravity.CENTER; setPadding(0, d(28), 0, d(8))
        })
        root.addView(ScrollView(this).apply { addView(col); clipToPadding = false }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        Ui.insets(root, col, root)
        setContentView(root)
    }

    private fun showHelp() {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("So geht's")
            .setMessage(
                "1.  Foto aufnehmen oder ein Bild aus der Galerie wählen. Das Motiv in der Mitte wird automatisch erkannt.\n\n" +
                "2.  Falsches Motiv? Lange auf den richtigen Gegenstand drücken. Mit „+ Motiv“ und „− Weg“ kurz darüberwischen, um nachzubessern.\n\n" +
                "3.  Gewünschte Höhe in cm und die Nahtzugabe eingeben, speichern.\n\n" +
                "4.  Als PDF in Originalgröße drucken – oder einen Marker neben den Stoff legen und das Muster mit der Kamera direkt auf den Stoff projizieren."
            )
            .setPositiveButton("Verstanden", null)
            .show()
    }

    override fun onResume() {
        super.onResume()
        list.removeAllViews()
        val items = PatternStore.list(this)
        if (items.isEmpty()) list.addView(Ui.body(this, "Noch keine Schnittmuster – leg mit „Foto aufnehmen“ los."))
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
