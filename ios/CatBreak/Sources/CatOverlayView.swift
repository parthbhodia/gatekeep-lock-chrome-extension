import SwiftUI
import AVFoundation
import UIKit

// MARK: - Keyed cat video

/// Plays the cat clip through the chroma-key video composition so the cat is
/// a true cut-out (transparent background) walking over whatever is behind it
/// in our view hierarchy.
final class KeyedPlayerUIView: UIView {
    private let playerLayer = AVPlayerLayer()
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?

    init(url: URL) {
        super.init(frame: .zero)
        let asset = AVURLAsset(url: url)
        let item = AVPlayerItem(asset: asset)
        item.videoComposition = ChromaKey.composition(for: asset)
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.isMuted = true
        playerLayer.player = player
        playerLayer.videoGravity = .resizeAspect
        // BGRA surface so the keyed alpha actually renders as transparency.
        playerLayer.pixelBufferAttributes = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        layer.addSublayer(playerLayer)
        player.play()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        playerLayer.frame = bounds
    }
}

struct KeyedCatVideoView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> KeyedPlayerUIView {
        KeyedPlayerUIView(url: url)
    }

    func updateUIView(_ uiView: KeyedPlayerUIView, context: Context) {}
}

// MARK: - Overlay

enum CatOverlayMode {
    /// "Preview the break" from the Cat tab.
    case preview
    /// A watched app just opened (greeting automation). nil hides Continue.
    case greeting(returnURL: URL?)
}

/// The extension's break overlay, ported: the whole keyed-out cat over the
/// screen with a giant countdown card. iOS can't render Instagram's own
/// pixels behind another app, so the cat brings its own night backdrop —
/// while the Screen Time shield guards the app underneath.
struct CatOverlayView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    let mode: CatOverlayMode

    @State private var meowLine = MeowLines.random()
    @State private var endsAt: Date = .distantFuture
    @State private var remaining = 0
    @State private var finished = false
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private let cream = Color(red: 1.0, green: 0.95, blue: 0.86)

    private var returnURL: URL? {
        if case .greeting(let url) = mode { return url }
        return nil
    }

    private var isPreview: Bool {
        if case .preview = mode { return true }
        return false
    }

    private var video: CatVideo? {
        if model.settings.randomCat { return model.videos.randomElement() }
        return model.videos.first { $0.file == model.settings.catVideoFile } ?? model.videos.first
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color(red: 0.07, green: 0.09, blue: 0.15).ignoresSafeArea()
                RadialGradient(
                    colors: [Color(red: 0.45, green: 0.36, blue: 0.6).opacity(0.35), .clear],
                    center: .topTrailing, startRadius: 20, endRadius: geo.size.width
                )
                .ignoresSafeArea()

                if let video {
                    KeyedCatVideoView(url: video.url)
                        .frame(width: geo.size.width * 0.8, height: geo.size.height * 0.6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                        .ignoresSafeArea(edges: .bottom)
                        .allowsHitTesting(false)
                }

                VStack(spacing: 20) {
                    Text(meowLine)
                        .font(.title3.weight(.semibold))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(cream)
                        .padding(.horizontal, 28)
                        .padding(.top, 40)

                    // The extension's giant tabular countdown, in card form.
                    Text(String(format: "%d:%02d", remaining / 60, remaining % 60))
                        .font(.system(size: 96, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(.black)
                        .padding(.horizontal, 36)
                        .padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: 22).fill(Color.white.opacity(0.93)))
                        .shadow(color: .black.opacity(0.35), radius: 24, y: 10)

                    Spacer()

                    bottomButtons
                        .padding(.bottom, 28)
                }
            }
        }
        .onAppear(perform: start)
        .onReceive(ticker) { _ in tick() }
    }

    @ViewBuilder
    private var bottomButtons: some View {
        VStack(spacing: 10) {
            if finished, let returnURL {
                Button {
                    goBack(to: returnURL)
                } label: {
                    Text("Continue 🐾").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .padding(.horizontal, 24)
            } else if model.settings.allowShoo || isPreview {
                Button {
                    if isPreview {
                        dismiss()
                    } else {
                        model.shooNow()
                        if let returnURL { goBack(to: returnURL) } else { dismiss() }
                    }
                } label: {
                    Text("Shoo 🐾").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                .padding(.horizontal, 24)
            }
            if !isPreview {
                Button("Okay, taking a real break") { dismiss() }
                    .foregroundStyle(cream.opacity(0.6))
            }
        }
    }

    private func start() {
        SharedStore.lastTakeoverAt = Date()
        if isPreview {
            // Capped so demoing doesn't hold the screen for a full break.
            endsAt = Date().addingTimeInterval(TimeInterval(min(model.settings.breakMinutes * 60, 180)))
        } else if let breakEnd = SharedStore.breakEndsAt, breakEnd > Date() {
            // Over the limit: the cat lingers for the rest of the break.
            endsAt = breakEnd
        } else {
            // Plain greeting: a short hello before letting the user through.
            endsAt = Date().addingTimeInterval(TimeInterval(max(3, model.settings.greetSeconds)))
        }
        tick()
    }

    private func tick() {
        remaining = max(0, Int(endsAt.timeIntervalSince(Date()).rounded()))
        guard remaining == 0, !finished else { return }
        finished = true
        model.endExpiredBreakIfNeeded()
        // Greeting flows head back on their own, like the overlay clearing.
        if let returnURL {
            goBack(to: returnURL)
        } else if isPreview {
            dismiss()
        }
    }

    private func goBack(to url: URL) {
        SharedStore.lastTakeoverAt = Date()
        openURL(url)
        dismiss()
    }
}
