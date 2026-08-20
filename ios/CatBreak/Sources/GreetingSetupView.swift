import SwiftUI
import UIKit

/// Walks the user through the one-time Shortcuts automation that makes the
/// cat take over the screen whenever a watched app (e.g. Instagram) opens —
/// the closest thing iOS allows to "draw the cat over another app".
struct GreetingSetupView: View {
    @State private var scheme = "instagram"
    @State private var copied = false

    private var greetingURL: String { "catbreak://break?return=\(scheme)" }

    var body: some View {
        List {
            Section {
                Text("iOS never lets one app draw over another. Instead, a one-time Shortcuts automation opens Cat Break the moment Instagram does — the cat video takes the screen, and when you continue, it shrinks into a floating window that rides on top. 🐾")
                    .font(.callout)
            }

            Section("1 · Copy the greeting link") {
                Picker("App to greet", selection: $scheme) {
                    Text("Instagram").tag("instagram")
                    Text("TikTok").tag("tiktok")
                    Text("YouTube").tag("youtube")
                    Text("X (Twitter)").tag("twitter")
                }
                HStack {
                    Text(greetingURL)
                        .font(.footnote.monospaced())
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button(copied ? "Copied!" : "Copy") {
                        UIPasteboard.general.string = greetingURL
                        copied = true
                    }
                    .buttonStyle(.bordered)
                }
            }

            Section("2 · Create the automation (once)") {
                Label("Open the Shortcuts app → Automation → +", systemImage: "plus.circle")
                Label("Choose “App” → pick the app → “Is Opened” → Run Immediately", systemImage: "app.badge")
                Label("Add the action “Open URLs” and paste the copied link", systemImage: "link")
            }

            Section("3 · Stop greeting loops (recommended)") {
                Text("Returning to Instagram counts as opening it again. Add Cat Break's “Is the cat napping?” action before “Open URLs”, wrapped in an If — only open the link when the answer is No. The cat naps for 3 minutes after each greeting, and Cat Break also bounces straight back if a greeting arrives mid-nap.")
                    .font(.callout)
            }

            Section {
                Label("After Continue, the cat keeps playing in a small floating window over the app — drag it, resize it, or flick it off-screen when you're done.", systemImage: "pip")
                Label("Greetings are a nudge, not a lock. The daily-limit shield stays the firm backstop.", systemImage: "pawprint")
            } header: {
                Text("What to expect")
            }
        }
        .navigationTitle("Cat greetings")
    }
}
