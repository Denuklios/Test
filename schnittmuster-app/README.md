# MusterBlick

Android-App: Gegenstand fotografieren → Schnittmuster in Originalgröße → als PDF drucken oder per Kamera auf den Stoff projizieren.

- **Marker-Blatt** (A4, 6 ArUco-Marker) liefert Maßstab und Entzerrung im Foto und verankert das Muster in der Kamera-Ansicht.
- **Foto → Muster:** Entzerrung per Homografie, Umriss per GrabCut, Glätten/Symmetrie/Nahtzugabe über eine Raster-Maske.
- **PDF:** Muster 1:1 auf A4 gekachelt mit Übersichtsseite und 5-cm-Kontrollquadrat.
- **Projektion:** CameraX + OpenCV-ArUco, Muster neben dem Blatt, verschieben/drehen/spiegeln/sperren.

Bauen: `gradle assembleRelease` (Android SDK 35; Signatur über `signing.properties`, nicht im Repo).
