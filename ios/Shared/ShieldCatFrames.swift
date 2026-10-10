import Foundation
import UIKit

/// Baked, chroma-keyed cat stills for the shield (see ShieldCatBaker in the
/// app target). The shield template only accepts a static image, so this is
/// how a real cat — not the app logo — greets the user over the frosted app.
enum ShieldCatFrames {
    static var directory: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: SharedConstants.appGroup)?
            .appendingPathComponent("shield-cats", isDirectory: true)
    }

    static func pngName(for videoFile: String) -> String {
        videoFile.replacingOccurrences(of: ".mp4", with: "") + ".png"
    }

    /// The chosen video's frame when random mode is off, otherwise any baked
    /// frame. nil until the app has baked frames — callers fall back to the
    /// bundled icon.
    static func frameForCurrentSettings() -> UIImage? {
        guard let dir = directory,
              let files = try? FileManager.default.contentsOfDirectory(
                  at: dir, includingPropertiesForKeys: nil)
        else { return nil }
        let pngs = files.filter { $0.pathExtension == "png" }
        guard !pngs.isEmpty else { return nil }

        let settings = SharedStore.loadSettings()
        if !settings.randomCat {
            let wanted = dir.appendingPathComponent(pngName(for: settings.catVideoFile))
            if let image = UIImage(contentsOfFile: wanted.path) { return image }
        }
        guard let pick = pngs.randomElement() else { return nil }
        return UIImage(contentsOfFile: pick.path)
    }
}
