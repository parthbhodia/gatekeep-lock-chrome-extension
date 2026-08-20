import SwiftUI

/// The popup's "Cat" tab: default limit, break length, random cat, video
/// gallery, preview and shoo.
struct CatTabView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showPreview = false

    private let limitChips = [15, 30, 45, 60, 90]
    private let breakChips = [5, 10, 15, 30]

    var body: some View {
        NavigationStack {
            Form {
                Section("Default time limit") {
                    ChipRow(values: limitChips, selection: $model.settings.defaultLimitMinutes, unit: "min")
                    Stepper(
                        "Custom: \(model.settings.defaultLimitMinutes) min",
                        value: $model.settings.defaultLimitMinutes,
                        in: 1...600,
                        step: 5
                    )
                }

                Section {
                    ChipRow(values: breakChips, selection: $model.settings.breakMinutes, unit: "min")
                    Stepper(
                        "Custom: \(model.settings.breakMinutes) min",
                        value: $model.settings.breakMinutes,
                        in: 1...240,
                        step: 5
                    )
                } header: {
                    Text("Break length (auto-dismiss)")
                } footer: {
                    Text("Breaks of 15 minutes or more end on their own (an iOS scheduling minimum). Shorter breaks end when you tap Shoo on the cat screen or reopen Cat Break.")
                }

                Section("Cat video") {
                    Toggle("Random cat each break", isOn: $model.settings.randomCat)
                    if !model.settings.randomCat {
                        Picker("Video", selection: $model.settings.catVideoFile) {
                            ForEach(model.videos) { video in
                                Text(video.label).tag(video.file)
                            }
                        }
                    }
                }

                Section {
                    Button {
                        showPreview = true
                    } label: {
                        Label("Preview the break", systemImage: "play.circle")
                    }
                    Button(role: .destructive) {
                        model.shooNow()
                    } label: {
                        Label("Shoo the cat now", systemImage: "hand.wave")
                    }
                } footer: {
                    Text("Shoo lifts any active cat screen and re-arms your limits.")
                }

                if let error = model.scheduleError {
                    Section {
                        Text(error).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Cat Break")
            .fullScreenCover(isPresented: $showPreview) {
                BreakPreviewView()
            }
        }
    }
}

/// Quick-select chips, like the popup's preset buttons.
struct ChipRow: View {
    let values: [Int]
    @Binding var selection: Int
    let unit: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(values, id: \.self) { value in
                    Button("\(value) \(unit)") { selection = value }
                        .buttonStyle(.bordered)
                        .tint(selection == value ? .orange : .secondary)
                }
            }
        }
    }
}
