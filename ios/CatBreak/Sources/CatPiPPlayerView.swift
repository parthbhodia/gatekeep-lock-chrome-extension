import SwiftUI
import AVKit
import AVFoundation

/// Looping, muted, Picture-in-Picture-capable player. When the app goes to
/// the background while this is playing (e.g. "Continue" back to Instagram),
/// the video shrinks into a floating PiP window that hovers on top of the
/// other app — the only kind of overlay iOS permits third-party apps.
struct CatPiPPlayerView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        // PiP requires an active .playback audio session, even for muted video.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        let player = AVQueuePlayer()
        context.coordinator.looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        player.isMuted = true

        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsPlaybackControls = false
        controller.allowsPictureInPicturePlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        player.play()
        return controller
    }

    func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// Keeps the looper alive for the lifetime of the representable.
    final class Coordinator {
        var looper: AVPlayerLooper?
    }
}
