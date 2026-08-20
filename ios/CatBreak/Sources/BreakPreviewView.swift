import SwiftUI
import AVKit

/// Full-screen replica of the Chrome overlay: looping cat video, a meow line,
/// and a shoo button. Used by Preview, and the natural landing screen when the
/// user leaves a shielded app and opens Cat Break.
struct BreakPreviewView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var meowLine = MeowLines.random()

    private var video: CatVideo? {
        if model.settings.randomCat { return model.videos.randomElement() }
        return model.videos.first { $0.file == model.settings.catVideoFile } ?? model.videos.first
    }

    var body: some View {
        ZStack {
            Color(red: 0.07, green: 0.09, blue: 0.15).ignoresSafeArea()

            VStack(spacing: 24) {
                if let video {
                    LoopingVideoPlayer(url: video.url)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .padding(.horizontal)
                }

                Text(meowLine)
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color(red: 1.0, green: 0.95, blue: 0.86))
                    .padding(.horizontal, 32)

                Button("Shoo 🐾") { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
            }
        }
    }
}
