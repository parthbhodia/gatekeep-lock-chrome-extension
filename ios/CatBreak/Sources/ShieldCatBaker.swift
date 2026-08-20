import Foundation
import UIKit
import AVFoundation
import CoreImage

/// Bakes chroma-keyed still frames from the cat videos into the App Group so
/// the shield can show a REAL cat. Apple's shield template accepts only a
/// static image — a keyed still from the actual clips is the closest to the
/// video the platform allows there. The shield extension never bakes; it only
/// reads the results via ShieldCatFrames.
enum ShieldCatBaker {
    /// Bakes frames for up to `limit` videos that don't have one yet.
    static func bakeMissingFrames(for videos: [CatVideo], limit: Int = 6) async {
        guard let dir = ShieldCatFrames.directory else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var baked = 0
        for video in videos {
            guard baked < limit else { break }
            let out = dir.appendingPathComponent(ShieldCatFrames.pngName(for: video.file))
            guard !FileManager.default.fileExists(atPath: out.path) else { continue }
            if let image = await keyedFrame(from: video.url), let data = image.pngData() {
                try? data.write(to: out)
                baked += 1
            }
        }
    }

    /// Grabs a frame a moment into the clip and runs it through the same
    /// color cube the overlay uses, then trims the transparent margins.
    private static func keyedFrame(from url: URL) async -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 720, height: 720)
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 1, preferredTimescale: 600)
        let time = CMTime(seconds: 1.5, preferredTimescale: 600)
        guard let cg = try? generator.copyCGImage(at: time, actualTime: nil) else { return nil }

        let keyed = CIImage(cgImage: cg).applyingFilter("CIColorCube", parameters: [
            "inputCubeDimension": ChromaKey.cubeDimension,
            "inputCubeData": ChromaKey.cubeData
        ])
        let context = CIContext()
        guard let keyedCG = context.createCGImage(keyed, from: keyed.extent) else { return nil }
        return UIImage(cgImage: croppedToAlphaBounds(keyedCG) ?? keyedCG)
    }

    /// Port of content.js getAlphaBounds: crop to the cat's bounding box so
    /// the shield icon is all cat, no empty canvas.
    private static func croppedToAlphaBounds(_ image: CGImage, threshold: UInt8 = 28) -> CGImage? {
        let width = image.width, height = image.height
        guard width > 0, height > 0 else { return nil }
        var pixels = [UInt8](repeating: 0, count: width * height)
        guard let ctx = CGContext(
            data: &pixels, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue
        ) else { return nil }
        // Flip so scan coordinates match CGImage.cropping's top-left origin.
        ctx.translateBy(x: 0, y: CGFloat(height))
        ctx.scaleBy(x: 1, y: -1)
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        var minX = width, minY = height, maxX = -1, maxY = -1
        for y in 0..<height {
            for x in 0..<width where pixels[y * width + x] > threshold {
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
            }
        }
        guard maxX >= minX, maxY >= minY else { return nil }
        let pad = 6
        let x0 = max(0, minX - pad), y0 = max(0, minY - pad)
        let rect = CGRect(
            x: x0, y: y0,
            width: min(width, maxX + pad + 1) - x0,
            height: min(height, maxY + pad + 1) - y0
        )
        return image.cropping(to: rect)
    }
}
