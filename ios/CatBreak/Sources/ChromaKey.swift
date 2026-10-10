import Foundation
import AVFoundation
import CoreImage

/// Ports the extension's canvas chroma-key (content.js — getGreenKeyStrength,
/// smoothstep, and the green-spill suppression) into a Core Image color cube
/// applied as an AVVideoComposition, so the cat renders with real per-pixel
/// transparency and walks over the overlay exactly like on the web.
enum ChromaKey {
    static let cubeDimension = 64
    static let cubeData = makeCube()

    static func composition(for asset: AVAsset) -> AVMutableVideoComposition {
        AVMutableVideoComposition(asset: asset) { request in
            let filter = CIFilter(name: "CIColorCube")
            filter?.setValue(cubeDimension, forKey: "inputCubeDimension")
            filter?.setValue(cubeData, forKey: "inputCubeData")
            filter?.setValue(request.sourceImage, forKey: kCIInputImageKey)
            request.finish(with: filter?.outputImage ?? request.sourceImage, context: nil)
        }
    }

    private static func smoothstep(_ edge0: Float, _ edge1: Float, _ value: Float) -> Float {
        let x = min(1, max(0, (value - edge0) / (edge1 - edge0)))
        return x * x * (3 - 2 * x)
    }

    /// content.js getGreenKeyStrength, kept in the same 0–255 domain so the
    /// constants match the extension exactly.
    private static func greenKeyStrength(r: Float, g: Float, b: Float) -> Float {
        let maxC = max(r, max(g, b))
        let minC = min(r, min(g, b))
        let maxRedBlue = max(r, b)
        let saturation = maxC == 0 ? 0 : (maxC - minC) / maxC
        let greenExcess = g - maxRedBlue
        let greenLeaning = g > r * 1.04 && g > b * 1.08

        if !greenLeaning || saturation < 0.085 { return 0 }

        let dominance = smoothstep(6, 54, greenExcess)
        let saturationStrength = smoothstep(0.085, 0.42, saturation)
        let brightness = smoothstep(18, 74, maxC)
        let shadow: Float = greenExcess > 4
            ? smoothstep(0.11, 0.32, saturation) * brightness * 0.62
            : 0

        return min(1, max(dominance * saturationStrength, shadow))
    }

    private static func makeCube() -> Data {
        let n = cubeDimension
        var cube = [Float](repeating: 0, count: n * n * n * 4)
        var offset = 0
        for bi in 0..<n {
            for gi in 0..<n {
                for ri in 0..<n {
                    let r = Float(ri) / Float(n - 1) * 255
                    let g = Float(gi) / Float(n - 1) * 255
                    let b = Float(bi) / Float(n - 1) * 255

                    let strength = greenKeyStrength(r: r, g: g, b: b)
                    let alpha: Float
                    if strength > 0.86 {
                        alpha = 0
                    } else if strength > 0.07 {
                        alpha = 1 - smoothstep(0.07, 0.86, strength)
                    } else {
                        alpha = 1
                    }

                    // Green-spill suppression, same constants as the extension.
                    var outG = g
                    if strength > 0.01 || g > r * 0.82 || g > b + 6 {
                        outG = min(g, r * 0.62 + b * 0.28 + 10)
                    }

                    // CIColorCube expects premultiplied RGBA in 0–1.
                    cube[offset] = (r / 255) * alpha
                    cube[offset + 1] = (outG / 255) * alpha
                    cube[offset + 2] = (b / 255) * alpha
                    cube[offset + 3] = alpha
                    offset += 4
                }
            }
        }
        return cube.withUnsafeBufferPointer { Data(buffer: $0) }
    }
}
