import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:hjemme/geo.dart';
import 'package:hjemme/models.dart';

void main() {
  test('Tag wird in Aufenthalt – Fahrt – Aufenthalt zerlegt', () {
    final t0 = DateTime(2026, 11, 17, 7, 0);
    final pts = <Pt>[];
    // 30 Min. zuhause
    for (var i = 0; i <= 30; i += 2) {
      pts.add(Pt(t0.add(Duration(minutes: i)), LatLng(55.0 + i * 0.000001, 10.0), acc: 10, spd: 0));
    }
    // 10 Min. Autofahrt Richtung Norden (ca. 8 km, 50 km/h)
    for (var i = 1; i <= 10; i++) {
      pts.add(Pt(t0.add(Duration(minutes: 30 + i)), LatLng(55.0 + i * 0.0075, 10.0), acc: 8, spd: 14));
    }
    // 20 Min. in der Schule
    for (var i = 1; i <= 10; i++) {
      pts.add(Pt(t0.add(Duration(minutes: 40 + i * 2)), const LatLng(55.075, 10.0), acc: 10, spd: 0));
    }
    final schule = Place(id: 's', name: 'Schule', icon: '🏫', lat: 55.075, lng: 10.0, radius: 150);
    final segs = segment(pts, places: [schule]);
    expect(segs.map((s) => s.runtimeType.toString()).toList(), ['Stay', 'Trip', 'Stay']);
    final trip = segs[1] as Trip;
    expect(trip.mode, Mode.drive);
    expect(trip.distance, greaterThan(7000));
    expect((segs[2] as Stay).place?.name, 'Schule');
    final st = stats(pts, [schule], 40);
    expect(st.drives, 1);
    expect(st.speeding, greaterThan(0));
  });

  test('Formatierung', () {
    expect(fmtDist(850), '850 m');
    expect(fmtDist(2400), '2,4 km');
    expect(fmtDuration(const Duration(minutes: 75)), '1 Std. 15 Min.');
  });

  test('Lücke ohne Daten wird nicht als Fahrt gezählt', () {
    final t0 = DateTime(2026, 11, 18, 12, 0);
    final pts = <Pt>[
      // in Kruså (ca. 30 km weg) bis 12:20
      for (var i = 0; i <= 20; i += 2) Pt(t0.add(Duration(minutes: i)), const LatLng(54.85, 9.40), acc: 10, spd: 0),
      // dann 50 Min. nichts, nächster Punkt zuhause
      for (var i = 70; i <= 90; i += 2) Pt(t0.add(Duration(minutes: i)), const LatLng(55.10, 9.60), acc: 10, spd: 0),
    ];
    final segs = segment(pts);
    expect(segs.map((s) => s.runtimeType.toString()).toList(), ['Stay', 'Gap', 'Stay']);
    expect(stats(pts, [], 0).trips, 0);
  });
}
