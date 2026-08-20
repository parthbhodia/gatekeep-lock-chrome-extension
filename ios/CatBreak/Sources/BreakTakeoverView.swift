import SwiftUI

/// The full takeover: shown when a Shortcuts greeting automation opens
/// Cat Break as a watched app launches (catbreak://break?return=instagram).
/// Plays the cat video; "Continue" heads back to the app — and because the
/// player is PiP-enabled, the cat shrinks into a floating window that keeps
/// hovering over it.
struct BreakTakeoverView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var meowLine = MeowLines.random()

    let request: TakeoverRequest

    private var video: CatVideo? {
        if model.settings.randomCat { return model.videos.randomElement() }
        return model.videos.first { $0.file == model.settings.catVideoFile } ?? model.videos.first
    }

    var body: some View {
        ZStack {
            Color(red: 0.07, green: 0.09, blue: 0.15).ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                if let video {
                    CatPiPPlayerView(url: video.url)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .padding(.horizontal)
                }

                Text(meowLine)
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color(red: 1.0, green: 0.95, blue: 0.86))
                    .padding(.horizontal, 32)

                Spacer()

                if let returnURL = request.returnURL {
                    // Not dismissed here on purpose: the player must stay alive
                    // while the app backgrounds, or auto-PiP has nothing to float.
                    Button {
                        SharedStore.lastTakeoverAt = Date()
                        openURL(returnURL)
                    } label: {
                        Text("Continue — the cat rides along 🐾")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .padding(.horizontal)
                }

                Button("Okay, taking a real break") { dismiss() }
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 24)
            }
        }
        .onAppear { SharedStore.lastTakeoverAt = Date() }
    }
}
