import SwiftUI
import FamilyControls
import ManagedSettings

/// The popup's "Settings" tab. iOS flips the extension's model: instead of
/// "time everything except exclusions", you explicitly pick which apps,
/// categories, and websites to watch (Apple's FamilyActivityPicker).
struct SettingsTabView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showPicker = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        showPicker = true
                    } label: {
                        HStack {
                            Label("Choose apps to limit", systemImage: "checklist")
                            Spacer()
                            Text(selectionSummary).foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("Watched apps")
                } footer: {
                    Text("Like the extension's site list: only what you pick here is timed. Categories and websites count too.")
                }

                if !model.selection.applicationTokens.isEmpty {
                    Section {
                        ForEach(Array(model.selection.applicationTokens), id: \.self) { token in
                            PerAppLimitRow(token: token)
                        }
                    } header: {
                        Text("Limit by app")
                    } footer: {
                        Text("Give an app its own minutes; everything else uses the default limit.")
                    }
                }

                Section {
                    Toggle("Show the Shoo button on the cat screen", isOn: $model.settings.allowShoo)
                } footer: {
                    Text("Turn this off for firmer breaks — the cat stays until the break ends.")
                }
            }
            .navigationTitle("Settings")
            .familyActivityPicker(isPresented: $showPicker, selection: $model.selection)
        }
    }

    private var selectionSummary: String {
        let apps = model.selection.applicationTokens.count
        let cats = model.selection.categoryTokens.count
        let webs = model.selection.webDomainTokens.count
        if apps + cats + webs == 0 { return "None yet" }
        var parts: [String] = []
        if apps > 0 { parts.append("\(apps) app\(apps == 1 ? "" : "s")") }
        if cats > 0 { parts.append("\(cats) categor\(cats == 1 ? "y" : "ies")") }
        if webs > 0 { parts.append("\(webs) site\(webs == 1 ? "" : "s")") }
        return parts.joined(separator: ", ")
    }
}

/// One watched app with an optional per-app override. Label(token) renders the
/// app's real name and icon while the code never learns which app it is —
/// Apple's privacy design.
struct PerAppLimitRow: View {
    @EnvironmentObject private var model: AppModel
    let token: ApplicationToken

    private let choices = [15, 30, 45, 60, 90]

    var body: some View {
        HStack {
            Label(token)
            Spacer()
            Menu(overrideText) {
                Button("Default") {
                    model.settings.perAppLimitMinutes[token.storageKey] = nil
                }
                ForEach(choices, id: \.self) { minutes in
                    Button("\(minutes) min") {
                        model.settings.perAppLimitMinutes[token.storageKey] = minutes
                    }
                }
            }
        }
    }

    private var overrideText: String {
        if let minutes = model.settings.perAppLimitMinutes[token.storageKey] {
            return "\(minutes) min"
        }
        return "Default"
    }
}
