import SwiftUI
import AVKit
import AVFoundation

/// Seamlessly looping, muted video — the same feel as the overlay's
/// <video loop muted> element.
struct LoopingVideoPlayer: View {
    let url: URL
    @State private var player = AVQueuePlayer()
    @State private var looper: AVPlayerLooper?

    var body: some View {
        VideoPlayer(player: player)
            .disabled(true)
            .onAppear {
                let item = AVPlayerItem(url: url)
                looper = AVPlayerLooper(player: player, templateItem: item)
                player.isMuted = true
                player.play()
            }
            .onDisappear { player.pause() }
    }
}
