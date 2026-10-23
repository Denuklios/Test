// iOS-Widget „Nächster Dienst“ (WidgetKit).
// Einrichtung in Xcode siehe README, Abschnitt „iPhone“: Widget-Extension „NextShiftWidget“ anlegen,
// diese Datei verwenden und bei Runner und Widget die App Group group.de.sonderpreis.dienstplan aktivieren.
import SwiftUI
import WidgetKit

private let appGroup = "group.de.sonderpreis.dienstplan"

struct ShiftItem: Decodable {
  let start: Double
  let end: Double
  let day: String
  let name: String
  let time: String
  let color: String
  let note: String
}

struct ShiftEntry: TimelineEntry {
  let date: Date
  let state: String
  let shift: ShiftItem?
}

private func loadShifts() -> (String, [ShiftItem]) {
  let d = UserDefaults(suiteName: appGroup)
  let state = d?.string(forKey: "state") ?? "logout"
  guard let raw = d?.string(forKey: "shifts"), let data = raw.data(using: .utf8),
        let list = try? JSONDecoder().decode([ShiftItem].self, from: data) else { return (state, []) }
  return (state, list)
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> ShiftEntry {
    ShiftEntry(date: Date(), state: "ok", shift: ShiftItem(start: 0, end: 0, day: "Mo 27.10.", name: "Früh", time: "08:00–16:30", color: "#2f80ed", note: ""))
  }

  func getSnapshot(in context: Context, completion: @escaping (ShiftEntry) -> Void) {
    completion(entry(at: Date()))
  }

  // Für jeden Dienstbeginn/-ende einen Eintrag, damit das Widget auch offline weiterschaltet
  func getTimeline(in context: Context, completion: @escaping (Timeline<ShiftEntry>) -> Void) {
    let now = Date()
    var dates: [Date] = [now]
    for s in loadShifts().1 {
      for t in [s.start, s.end] {
        let d = Date(timeIntervalSince1970: t / 1000)
        if d > now { dates.append(d) }
      }
    }
    let entries = dates.sorted().prefix(30).map { entry(at: $0) }
    completion(Timeline(entries: Array(entries), policy: .after(now.addingTimeInterval(3600))))
  }

  private func entry(at date: Date) -> ShiftEntry {
    let (state, list) = loadShifts()
    let ms = date.timeIntervalSince1970 * 1000
    return ShiftEntry(date: date, state: state, shift: list.first { $0.end > ms })
  }
}

private func color(_ hex: String) -> Color {
  var v: UInt64 = 0
  Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
  return Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
}

struct NextShiftView: View {
  let entry: ShiftEntry

  var body: some View {
    HStack(spacing: 10) {
      RoundedRectangle(cornerRadius: 3)
        .fill(entry.shift.map { color($0.color) } ?? Color.orange)
        .frame(width: 6)
      VStack(alignment: .leading, spacing: 2) {
        if entry.state == "logout" {
          Text("Dienstplan").font(.headline)
          Text("App öffnen zum Anmelden").font(.subheadline)
        } else if let s = entry.shift {
          let start = Date(timeIntervalSince1970: s.start / 1000)
          Text(start <= entry.date ? "JETZT IM DIENST" : "NÄCHSTER DIENST").font(.caption2).bold().foregroundColor(.secondary)
          Text(s.name).font(.title2).bold().lineLimit(1)
          Text("\(s.day)  \(s.time)").font(.subheadline).lineLimit(1)
          if start > entry.date {
            Text(start, style: .relative).font(.caption).bold().foregroundColor(.orange)
          }
          if !s.note.isEmpty { Text(s.note).font(.caption).lineLimit(1) }
        } else {
          Text("Kein Dienst").font(.headline)
          Text("in den nächsten Wochen").font(.subheadline)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(4)
    .containerBackground(for: .widget) { Color(.systemBackground) }
  }
}

@main
struct NextShiftWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NextShiftWidget", provider: Provider()) { entry in
      NextShiftView(entry: entry)
    }
    .configurationDisplayName("Nächster Dienst")
    .description("Zeigt deinen nächsten Dienst mit Uhrzeit.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
